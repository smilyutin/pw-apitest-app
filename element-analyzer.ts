// element-analyzer.ts
// Analyze pages → find similar, stable elements → emit POM report + BasePage.ts
// Run:
//   npx ts-node --transpile-only element-analyzer.ts --urls https://a,https://b --minSim 45 --headless true
// or (with proper tsconfig DOM libs installed):
//   npx ts-node element-analyzer.ts --urls https://a,https://b
// must ran 'npx ts-node --compiler-options '{"module":"CommonJS"}' element-analyzer.ts --urls https://conduit.bondaracademy.com/profile

import { chromium, Browser, Page, ElementHandle } from 'playwright';
import * as fs from 'fs';

// ------------------------- Types -------------------------
interface ElementCharacteristics {
  tagName: string;
  classes: string[];
  attributes: Record<string, string>;
  textContent: string;
  role?: string;
  placeholder?: string;
  type?: string;
  href?: string;
  src?: string;
}

interface ElementInfo {
  selector: string;
  characteristics: ElementCharacteristics;
  xpath: string;
  pageUrl: string;
}

interface SimilarityResult {
  element1: ElementInfo;
  element2: ElementInfo;
  similarityScore: number; // 0..100
  matchingAttributes: string[];
}

interface GroupedElement {
  suggestedLocator: string; // Playwright locator expression or CSS
  suggestedName: string;    // camelCase field name
  elementType: string;      // tagName
  commonAttributes: string[];
  pages: string[];
  selectors: string[];
  confidence: number;       // 0..100
  pomRecommendation: string;
}

// ------------------------- Small CLI (no deps) -------------------------
function argvFlag(name: string, def?: string): string | undefined {
  const idx = process.argv.findIndex(a => a === `--${name}`);
  if (idx >= 0) return process.argv[idx + 1];
  const kv = process.argv.find(a => a.startsWith(`--${name}=`));
  if (kv) return kv.split('=').slice(1).join('=');
  return def;
}

const CLI = {
  urls: (argvFlag('urls') || '').split(',').map(s => s.trim()).filter(Boolean),
  minSim: Number(argvFlag('minSim', '40')),
  headless: /^true$/i.test(argvFlag('headless', 'true') || 'true'),
  maxPerSelector: Number(argvFlag('maxPerSelector', '120')),
  outFile: argvFlag('outfile', './BasePage.ts')!,
  reportFile: argvFlag('report', './pom-locators-report.json')!,
};

// ------------------------- Analyzer -------------------------
class ElementSimilarityAnalyzer {
  private browser: Browser | null = null;

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({ headless: CLI.headless });
    console.log(' Browser launched.');
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      console.log(' Browser closed.');
    }
  }

  private assertBrowser(): void {
    if (!this.browser) throw new Error('Browser not initialized');
  }

  async navigateToPage(url: string): Promise<Page> {
    this.assertBrowser();
    const page = await (this.browser as Browser).newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 });
      console.log(`${url}`);
      return page;
    } catch (e) {
      await page.close();
      throw e;
    }
  }

  
  // Core “is this usable” filter
private async isElementInteractable(el: ElementHandle): Promise<boolean> {
  return el.evaluate((node: any) => {
    const style = (globalThis as any).getComputedStyle(node as any);
    if (style.display === 'none' || style.visibility === 'hidden' || +style.opacity === 0) return false;

    const rect = (node as any).getBoundingClientRect?.();
    if (!rect || rect.width === 0 || rect.height === 0) return false;

    const tag = (node as any).tagName.toLowerCase();
    const interactive = ['input', 'button', 'select', 'textarea', 'a', 'form'];
    if (interactive.includes(tag)) return true;

    if ((node as any).hasAttribute?.('onclick')) return true;

    const role = (node as any).getAttribute?.('role') || '';
    if (['button', 'link', 'tab', 'menuitem', 'search', 'navigation'].includes(role)) return true;

    if ((node as any).hasAttribute?.('tabindex')) return true;

    const semantic = ['h1','h2','h3','h4','h5','h6','main','nav','header','footer','article','section'];
    return semantic.includes(tag);
  });
}

  private isDecorative(characteristics: ElementCharacteristics): boolean {
    const decorativeClasses = [
      'ad','ads','advert','banner','promo','promotion',
      'decoration','ornament','divider','spacer','separator',
      'background','bg','overlay','backdrop','shadow','border','icon-only'
    ];
    const id = characteristics.attributes['id'] || '';
    const decId = /google|doubleclick|adsystem|advert/i.test(id);
    const hasDecClass = characteristics.classes.some(c =>
      decorativeClasses.some(d => c.toLowerCase().includes(d))
    );
    const isEmpty = !characteristics.textContent &&
      !['input','button','select','textarea'].includes(characteristics.tagName);
    return hasDecClass || decId || isEmpty;
  }

  private async extractCharacteristics(el: ElementHandle): Promise<ElementCharacteristics> {
    return el.evaluate((node: any) => {
      const attrs: Record<string, string> = {};
      const attrList = Array.from((node as any).attributes || []) as any[];
      for (const a of attrList) attrs[String(a.name)] = String(a.value);

      const classes = Array.from(((node as any).classList || [])) as string[];
      const role = (node as any).getAttribute?.('role') || undefined;
      const placeholder = (node as any).getAttribute?.('placeholder') || undefined;
      const type = (node as any).getAttribute?.('type') || undefined;
      const href = (node as any).getAttribute?.('href') || undefined;
      const src = (node as any).getAttribute?.('src') || undefined;

      const textContent = String((node as any).textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100);

      return {
        tagName: String((node as any).tagName).toLowerCase(),
        classes,
        attributes: attrs,
        textContent,
        role,
        placeholder,
        type,
        href,
        src
      } as ElementCharacteristics;
    }) as unknown as ElementCharacteristics;
  }

  private async cssSelector(el: ElementHandle): Promise<string> {
    return el.evaluate((node: any) => {
      const tag = String((node as any).tagName).toLowerCase();
      const id = (node as any).id;
      if (id) return `#${id}`;
      const cls = Array.from(((node as any).classList || [])) as string[];
      if (cls.length) return `${tag}.${cls.slice(0, 3).join('.')}`;
      return tag;
    });
  }

  private async xpath(el: ElementHandle): Promise<string> {
    return el.evaluate((node: any) => {
      const getXPath = (n: any): string => {
        if (n.id) return `//*[@id="${n.id}"]`;
        if (n === (globalThis as any).document.body) return '/html/body';
        const parent = n.parentElement;
        if (!parent) return '/';
        const sameTagSiblings = Array.from(parent.children).filter((s: any) => s.tagName === n.tagName);
        const index = sameTagSiblings.indexOf(n) + 1;
        return `${getXPath(parent)}/${String(n.tagName).toLowerCase()}[${index || 1}]`;
      };
      return getXPath(node);
    });
  }

  // Extract elements using a selector catalogue with caps + de-dup
  async extractElementsFromPage(page: Page, url: string): Promise<ElementInfo[]> {
    console.log('   • extracting…');
    const catalogue = [
      // Forms / inputs
      'input[type=text]','input[type=email]','input[type=password]','input[type=search]',
      'input[type=number]','input[type=tel]','input[type=url]','input[type=date]',
      'input[type=time]','input[type=datetime-local]','input[type=checkbox]','input[type=radio]',
      'input[type=file]','textarea','select','button',
      // Nav/links/roles
      'a[href]','nav a','[role=navigation] a','[role=button]','[role=tab]','[role=menuitem]','[role=link]','[tabindex]',
      // Data-test ids
      '[data-testid]','[data-test]','[data-cy]',
      // Semantics
      'form','fieldset','header','footer','nav','main','article','section',
      // Misc UI
      '[onclick]','.modal','.dialog','.popup','[role=dialog]','[role=alertdialog]'
    ];

    const seenFingerprints = new Set<string>();
    const results: ElementInfo[] = [];

    // small concurrency to avoid thrashing
    const pool = [...catalogue];
    while (pool.length) {
      const head = pool.splice(0, 4); // 4 at a time
      const batch = await Promise.all(head.map(async (sel) => {
        try {
          const handles = await page.$$(sel);
          const limited = handles.slice(0, CLI.maxPerSelector);
          const perSel: ElementInfo[] = [];
          for (const h of limited) {
            try {
              const interact = await this.isElementInteractable(h);
              if (!interact) continue;

              const ch = await this.extractCharacteristics(h);
              if (this.isDecorative(ch)) continue;

              // fingerprint to de-dup: tag|id|role|name|placeholder|href|first-class
              const fp = [
                ch.tagName, ch.attributes['id'] || '', ch.role || '',
                ch.attributes['name'] || '', ch.placeholder || '', ch.href || '',
                ch.classes[0] || ''
              ].join('|');
              if (seenFingerprints.has(fp)) continue;
              seenFingerprints.add(fp);

              perSel.push({
                selector: await this.cssSelector(h),
                characteristics: ch,
                xpath: await this.xpath(h),
                pageUrl: url
              });
            } catch { /* ignore single element failures */ }
            finally { await (h as any).dispose?.().catch(() => {}); }
          }
          return perSel;
        } catch { return []; }
      }));
      results.push(...batch.flat());
    }

    console.log(`   • ${results.length} elements`);
    return results;
  }

  // ------------------------- Similarity & Grouping -------------------------
  private similarity(a: ElementInfo, b: ElementInfo): SimilarityResult {
    const A = a.characteristics, B = b.characteristics;
    let score = 0, total = 0;
    const matched: string[] = [];

    // Tag weight 3
    total += 3;
    if (A.tagName === B.tagName) { score += 3; matched.push('tagName'); }

    // Classes weight up to 2
    const common = A.classes.filter(c => B.classes.includes(c)).slice(0, 2);
    total += 2;
    score += common.length;
    if (common.length) matched.push(`classes(${common.join(',')})`);

    // Attrs: role, type, placeholder (1 each)
    for (const k of ['role','type','placeholder'] as const) {
      total += 1;
      if ((A as any)[k] && (A as any)[k] === (B as any)[k]) { score += 1; matched.push(k); }
    }

    // Text (0.5)
    total += 1;
    if (A.textContent && B.textContent) {
      const t1 = A.textContent.toLowerCase(), t2 = B.textContent.toLowerCase();
      if (t1 === t2 || t1.includes(t2) || t2.includes(t1)) { score += 0.5; matched.push('text'); }
    }

    const pct = total ? (score / total) * 100 : 0;
    return { element1: a, element2: b, similarityScore: Math.round(pct * 100) / 100, matchingAttributes: matched };
  }

  findSimilarElements(all: ElementInfo[], min = CLI.minSim): SimilarityResult[] {
    const sims: SimilarityResult[] = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (all[i].pageUrl === all[j].pageUrl) continue;
        const s = this.similarity(all[i], all[j]);
        if (s.similarityScore >= min) sims.push(s);
      }
    }
    sims.sort((a, b) => b.similarityScore - a.similarityScore);
    console.log(`   • similar pairs ≥ ${min}%: ${sims.length}`);
    return sims;
  }

  private groupingKey(e: ElementInfo): string {
    const c = e.characteristics;
    return `${c.tagName}-${c.type || 'none'}-${c.role || 'none'}-${(c.classes[0] || '').slice(0, 24)}`;
  }

  groupSimilar(similarities: SimilarityResult[]): GroupedElement[] {
    const map = new Map<string, GroupedElement>();
    for (const s of similarities) {
      const key = this.groupingKey(s.element1);
      if (!map.has(key)) {
        const base = s.element1;
        map.set(key, {
          suggestedLocator: this.suggestLocator(base),
          suggestedName: this.suggestName(base),
          elementType: base.characteristics.tagName,
          commonAttributes: s.matchingAttributes,
          pages: [base.pageUrl, s.element2.pageUrl],
          selectors: [base.selector, s.element2.selector],
          confidence: s.similarityScore,
          pomRecommendation: this.pomRecommendation(base),
        });
      } else {
        const g = map.get(key)!;
        if (!g.pages.includes(s.element2.pageUrl)) g.pages.push(s.element2.pageUrl);
        if (!g.selectors.includes(s.element2.selector)) g.selectors.push(s.element2.selector);
        g.confidence = Math.max(g.confidence, s.similarityScore);
      }
    }
    return [...map.values()].sort((a, b) => b.confidence - a.confidence);
  }

  // ------------------------- Locator & Naming -------------------------
  private isDynamicId(id: string): boolean {
    const rx = [
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
      /^[a-f0-9]{16,}$/i,
      /\d{10,}/,
      /(random|temp|generated|uuid|guid)/i,
      /^(react|ember|mat|cdk|_ngcontent|vaadin|ant|chakra|mantine|mui)-/i,
    ];
    return rx.some(r => r.test(id));
  }

  private meaningfulClass(classes: string[]): string | null {
    const avoid = [
      /^(m|p|mt|mb|ml|mr|pt|pb|pl|pr|w|h|min|max|text|bg|border|shadow|rounded|flex|grid|block|inline|relative|absolute)(:|-)?/i,
      /(^sm:|^md:|^lg:|^xl:)/i, /util|utility|helper/i
    ];
    const prefer = [
      /(navbar|header|footer|sidebar|content|main|nav|menu)/i,
      /(btn|button)(?!.*(util|margin|padding))/i,
      /(form|input|search)/i,
      /(logo|brand|title)/i,
      /(toggle|dropdown|modal|dialog)/i,
    ];
    for (const p of prefer) {
      const hit = classes.find(c => p.test(c) && !avoid.some(a => a.test(c)));
      if (hit) return hit;
    }
    const fallback = classes.find(c => !avoid.some(a => a.test(c)) && c.length > 2);
    return fallback || null;
  }

  private suggestLocator(e: ElementInfo): string {
    const c = e.characteristics;

    // Prefer testing hooks
    for (const k of ['data-testid','data-cy','data-test']) {
      if (c.attributes[k]) return `[${k}="${c.attributes[k]}"]`;
    }
    // Role + accessible name
    const name = c.attributes['aria-label'] || (c.textContent || '').trim();
    if (c.role && name) {
      return `getByRole('${c.role}', { name: ${JSON.stringify(name)} })`;
    }
    if (c.role) return `getByRole('${c.role}')`;

    // Inputs
    if (c.tagName === 'input') {
      if (c.placeholder) return `getByPlaceholder(${JSON.stringify(c.placeholder)})`;
      if (c.attributes['name']) return `input[name="${c.attributes['name']}"]`;
      if (c.type) return `input[type="${c.type}"]`;
    }

    // Button by text
    if (c.tagName === 'button' && c.textContent && c.textContent.length < 50) {
      return `getByRole('button', { name: ${JSON.stringify(c.textContent)} })`;
    }

    // Link by href or text
    if (c.tagName === 'a') {
      if (c.textContent) return `getByRole('link', { name: ${JSON.stringify(c.textContent)} })`;
      if (c.href) return `a[href="${c.href}"]`;
    }

    // Stable id
    const id = c.attributes['id'];
    if (id && !this.isDynamicId(id)) return `#${id}`;

    // Meaningful class
    const mc = this.meaningfulClass(c.classes);
    if (mc) return `.${mc}`;

    // Semantic tags
    const sem = ['header','footer','nav','main','aside','section','article'];
    if (sem.includes(c.tagName)) return c.tagName;

    // Headings
    if (/^h[1-6]$/.test(c.tagName) && c.textContent) {
      return `${c.tagName}:has-text(${JSON.stringify(c.textContent.slice(0, 30))})`;
    }

    // Fallback
    return e.selector || c.tagName;
  }

  private cleanBaseName(n: string): string {
    let s = n.toLowerCase().trim();
    s = s.replace(/[-_\s]+/g, ' ').trim();
    if (!s) s = 'element';
    return s;
  }
  private toCamel(str: string): string {
    return this.cleanBaseName(str)
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (w, i) => i === 0 ? w.toLowerCase() : w.toUpperCase())
      .replace(/\s+/g,'')
      .replace(/[^a-zA-Z0-9]/g,'');
  }
  private suffix(tag: string, type?: string, role?: string): string {
    if (role) {
      const m: Record<string,string> = { button:'Button', link:'Link', tab:'Tab', tabpanel:'Panel', dialog:'Dialog', navigation:'Navigation', search:'Search', menu:'Menu', menuitem:'MenuItem' };
      if (m[role]) return m[role];
    }
    if (tag === 'a') return 'Link';
    if (tag === 'button' || type === 'submit' || type === 'button') return 'Button';
    if (tag === 'select') return 'Dropdown';
    if (tag === 'textarea') return 'Textarea';
    if (tag === 'form') return 'Form';
    if (tag === 'table') return 'Table';
    if (tag === 'nav') return 'Navigation';
    if (tag === 'header') return 'Header';
    if (tag === 'footer') return 'Footer';
    if (tag === 'main') return 'Content';
    if (/^h[1-6]$/.test(tag)) return 'Heading';
    if (tag === 'input') {
      const map: Record<string,string> = {
        text:'Input', email:'Input', password:'Input', number:'Input', tel:'Input', url:'Input', search:'Input',
        checkbox:'Checkbox', radio:'Radio', file:'FileInput', date:'DateInput', time:'DateInput', 'datetime-local':'DateInput'
      };
      return map[type || ''] || 'Input';
    }
    return 'Element';
  }
  // --- REPLACE suggestName(...) WITH THIS VERSION ---
private suggestName(e: ElementInfo): string {
  const c = e.characteristics;

  let base =
    c.attributes['data-testid'] ||
    c.attributes['aria-label'] ||
    ((!this.isDynamicId(c.attributes['id'] || '')) ? c.attributes['id'] : '') ||
    c.placeholder ||
    c.textContent ||
    c.attributes['name'] ||
    this.meaningfulClass(c.classes) ||
    (c.href ? (c.href === '/' || c.href.endsWith('/') ? 'home' : c.href.split('/').filter(Boolean).pop() || 'link') : '') ||
    c.tagName;

  base = this.cleanBaseName(base);
  const name = this.toCamel(base) + this.suffix(c.tagName, c.type, c.role);
  return name;
}

  private stability(e: ElementInfo): 'high'|'medium'|'low' {
    const c = e.characteristics;
    if (c.attributes['data-testid'] || (c.attributes['id'] && !this.isDynamicId(c.attributes['id'])) || c.role) return 'high';
    if (this.meaningfulClass(c.classes)) return 'medium';
    return 'low';
  }
  private pomRecommendation(e: ElementInfo): string {
    const s = this.stability(e);
    if (s === 'high') return 'Recommended for BasePage - stable across pages';
    if (s === 'medium') return 'Consider for BasePage - may need overrides';
    return 'Page-specific locator - avoid BasePage';
  }

  // ------------------------- Reports & Codegen -------------------------
  writeReport(groups: GroupedElement[], outfile = CLI.reportFile) {
    const payload = {
      timestamp: new Date().toISOString(),
      summary: {
        totalGroups: groups.length,
        basePageRecommendations: groups.filter(g => g.pomRecommendation.includes('BasePage')).length,
      },
      groups,
    };
    fs.writeFileSync(outfile, JSON.stringify(payload, null, 2));
    console.log(`📝 Report: ${outfile}`);
  }

  private escapeLocatorString(s: string) { return s.replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

  // --- REPLACE generateBasePage(...) WITH THIS VERSION ---
generateBasePage(groups: GroupedElement[], outFile = CLI.outFile): void {
  const cand = groups.filter(g =>
    g.pomRecommendation.includes('BasePage') && g.confidence >= 50
  );

  // Categorization helpers as before...
  const is = {
    nav: (g: GroupedElement) => /(nav|menu|home|docs|api)/i.test(g.suggestedName)
      || /role="navigation"|nav|menu|href=/.test(g.suggestedLocator.toLowerCase())
      || g.elementType === 'nav',
    header: (g: GroupedElement) => /(header|logo|brand)/i.test(g.suggestedName)
      || /header|logo|brand/.test(g.suggestedLocator.toLowerCase())
      || g.elementType === 'header',
    search: (g: GroupedElement) => /search|docsearch/.test(g.suggestedLocator.toLowerCase())
      || /search/i.test(g.suggestedName),
    sidebar: (g: GroupedElement) => /(sidebar|aside|toc|toggle)/i.test(g.suggestedName)
      || /(sidebar|aside|toc|toggle)/.test(g.suggestedLocator.toLowerCase())
      || g.elementType === 'aside',
    content: (g: GroupedElement) =>
      /(main|content|article|title|heading)/i.test(g.suggestedName)
      || /(main|content|article)/.test(g.suggestedLocator.toLowerCase())
      || ['main','section','article','h1','h2','h3','h4','h5','h6'].includes(g.elementType),
    form: (g: GroupedElement) =>
      /(form|input|button|dropdown|checkbox|radio)/i.test(g.suggestedName)
      || ['input','button','select','textarea','form'].includes(g.elementType),
    footer: (g: GroupedElement) => /(footer)/i.test(g.suggestedName)
      || g.elementType === 'footer',
    theme: (g: GroupedElement) => /(theme|dark|light|color-mode)/i.test(g.suggestedLocator.toLowerCase())
      || /(theme|dark|light)/i.test(g.suggestedName),
  };

  const sections = [
    ['Navigation Elements', cand.filter(is.nav)],
    ['Header Elements',     cand.filter(g => is.header(g) && !is.nav(g))],
    ['Search Elements',     cand.filter(is.search)],
    ['Sidebar Elements',    cand.filter(is.sidebar)],
    ['Content Elements',    cand.filter(is.content)],
    ['Form Elements',       cand.filter(g => is.form(g) && !is.search(g))],
    ['Footer Elements',     cand.filter(is.footer)],
    ['Theme Elements',      cand.filter(is.theme)],
    ['Utility Elements',    cand.filter(g =>
      !is.nav(g)&&!is.header(g)&&!is.search(g)&&!is.sidebar(g)&&!is.content(g)&&!is.form(g)&&!is.footer(g)&&!is.theme(g)
    )],
  ] as const;

  // NEW: de-dupe registries
  const seenLocators = new Set<string>();  // normalized locator → skip dups
  const usedFieldNames = new Set<string>(); // to avoid homeLink/homeLink1 unless truly necessary
  const usedHelperNames = new Set<string>(); // avoid duplicate gotoHome()

  const normalizeLocator = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');
  const uniqueFieldName = (base: string) => {
    if (!usedFieldNames.has(base)) { usedFieldNames.add(base); return base; }
    // only add suffix if we truly have a different locator (see below)
    let i = 2;
    while (usedFieldNames.has(`${base}${i}`)) i++;
    const name = `${base}${i}`;
    usedFieldNames.add(name);
    return name;
  };
  const uniqueHelperName = (base: string) => {
    if (!usedHelperNames.has(base)) { usedHelperNames.add(base); return base; }
    let i = 2;
    while (usedHelperNames.has(`${base}${i}`)) i++;
    const name = `${base}${i}`;
    usedHelperNames.add(name);
    return name;
  };

  // Declarations & constructor body
  let declarations = '';
  let ctorBody = '';
  // Collect nav helpers to emit once (deduped)
  const navHelpers: Array<{ helperName: string; fieldName: string; action: string }> = [];

  // Append a field if locator is new, otherwise skip
  const addField = (suggestedName: string, suggestedLocator: string, sectionTitle: string) => {
    const norm = normalizeLocator(suggestedLocator);
    if (seenLocators.has(norm)) return undefined; // skip duplicate locator
    seenLocators.add(norm);

    // keep original base name; only suffix if same name is reused for a different locator
    let fieldName = suggestedName;
    if (usedFieldNames.has(fieldName)) {
      fieldName = uniqueFieldName(suggestedName);
    } else {
      usedFieldNames.add(fieldName);
    }

    declarations += `  // ${sectionTitle}\n`;
    declarations += `  readonly ${fieldName}: Locator;\n\n`;

    if (/^getBy[A-Z]/.test(suggestedLocator)) {
      // source already a getBy* call
      const call = suggestedLocator.replace(/^getBy/, "this.page.getBy");
      ctorBody += `    // ${sectionTitle}\n`;
      ctorBody += `    this.${fieldName} = ${call};\n\n`;
    } else {
      const locEsc = this.escapeLocatorString(suggestedLocator);
      ctorBody += `    // ${sectionTitle}\n`;
      ctorBody += `    this.${fieldName} = this.page.locator('${locEsc}');\n\n`;
    }

    return fieldName;
  };

  // Build fields (deduped) and collect nav helpers
  for (const [title, list] of sections) {
    // Put a section header only if something is added
    let sectionHasAny = false;
    for (const e of list) {
      // Special case: collapse multiple home links if they point to the same href "/"
      // Your suggestName() will already try to name them "homeLink". De-dup by locator anyway.
      const fieldName = addField(e.suggestedName, e.suggestedLocator, title);
      if (!fieldName) continue;
      sectionHasAny = true;

      // Auto nav helpers: create only for Link/Button/Navigation-ish
      const lower = e.suggestedName.toLowerCase();
      if (/(home|signin|login|signout|logout|settings|profile)/.test(lower) ||
          e.elementType === 'a' || e.elementType === 'button' || /link|button$/i.test(e.suggestedName)) {
        // Human friendly helper names:
        let helperBase = '';
        if (lower.includes('home')) helperBase = 'gotoHome';
        else if (lower.includes('signin') || lower.includes('login')) helperBase = 'gotoSignIn';
        else if (lower.includes('logout') || lower.includes('signout')) helperBase = 'gotoLogout';
        else if (lower.includes('settings')) helperBase = 'gotoSettings';
        else if (lower.includes('profile')) helperBase = 'gotoProfile';
        else if (e.elementType === 'a') helperBase = `click${e.suggestedName[0].toUpperCase()}${e.suggestedName.slice(1)}`;

        if (helperBase) {
          const helperName = uniqueHelperName(helperBase);
          // De-dupe helpers by name so you don’t get two gotoHome() for the same locator:
          navHelpers.push({ helperName, fieldName, action: 'click' });
        }
      }
    }
    // Remove orphan section title comment if nothing added
    if (!sectionHasAny) {
      // nothing to do; we only printed per-field headers above
    }
  }

  let code = `import { Page, Locator } from '@playwright/test';\n\n`;
  code += `export class BasePage {\n`;
  code += declarations || '';
  code += `  constructor(private page: Page) {\n`;
  code += ctorBody || '';
  code += `  }\n\n`;
  code += this.utilityMethods();

  // Emit deduped nav helpers
  if (navHelpers.length) {
    code += `\n  // -------- Navigation Helpers (auto-generated) --------\n`;
    for (const h of navHelpers) {
      code += `  async ${h.helperName}() { await this.${h.fieldName}.${h.action}(); await this.waitForIdle(); }\n`;
    }
  }

  code += `}\n`;

  fs.writeFileSync(outFile, code, 'utf-8');
  console.log(`🧩 BasePage: ${outFile}  (fields=${usedFieldNames.size})`);
}

  private utilityMethods(): string {
    return (
`  // -------- Utilities --------
  async navigate(url: string): Promise<void> {
    await this.page.goto(url);
  }

  async waitForIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  async getTitle(): Promise<string> {
    return this.page.title();
  }

  async currentUrl(): Promise<string> {
    return this.page.url();
  }
`
    );
  }

  // Fallback: if no similarities found, pick recurring semantics
  createBasicGroups(all: ElementInfo[]): GroupedElement[] {
    const byKey = new Map<string, ElementInfo[]>();
    const basicKey = (e: ElementInfo) => {
      const c = e.characteristics;
      if (c.attributes['data-testid']) return `testid:${c.attributes['data-testid']}`;
      if (c.role) return `role:${c.role}`;
      if (c.tagName === 'a' && c.href) {
        if (c.href === '/' || c.href.endsWith('/')) return 'nav:home';
        if (c.href.includes('/docs')) return 'nav:docs';
        if (c.href.includes('/api')) return 'nav:api';
        return `nav:${c.href.split('/').filter(Boolean).pop() || 'link'}`;
      }
      if (['header','footer','nav','main','aside'].includes(c.tagName)) return `semantic:${c.tagName}`;
      if (c.classes.some(v => /search/i.test(v))) return 'search';
      if (c.classes.some(v => /toggle/i.test(v))) return 'toggle';
      if (c.classes.some(v => /theme|dark|light/i.test(v))) return 'theme';
      return `${c.tagName}-${c.type || 'default'}`;
    };
    for (const e of all) {
      const k = basicKey(e);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(e);
    }
    const groups: GroupedElement[] = [];
    for (const [, list] of byKey) {
      const pages = [...new Set(list.map(l => l.pageUrl))];
      if (pages.length >= 2) {
        const rep = list[0];
        groups.push({
          suggestedLocator: this.suggestLocator(rep),
          suggestedName: this.suggestName(rep),
          elementType: rep.characteristics.tagName,
          commonAttributes: Object.keys(rep.characteristics.attributes),
          pages,
          selectors: list.map(l => l.selector),
          confidence: 80,
          pomRecommendation: 'Recommended for BasePage - appears on multiple pages',
        });
      }
    }
    return groups.sort((a, b) => b.pages.length - a.pages.length);
  }
}

// ------------------------- Main -------------------------
async function main() {
  const analyzer = new ElementSimilarityAnalyzer();

  // URLs
  const urls = CLI.urls.length ? CLI.urls : [
    'https://conduit.bondaracademy.com/',
    'https://conduit.bondaracademy.com/profile',
    'https://conduit.bondaracademy.com/settings'
  ];

  console.log('▶️ Element Similarity Analyzer');
  console.log(`   urls: ${urls.length}`);
  console.log(`   minSim: ${CLI.minSim}%   headless: ${CLI.headless}   maxPerSelector: ${CLI.maxPerSelector}`);
  console.log('');

  try {
    await analyzer.initialize();

    const all: ElementInfo[] = [];
    for (const url of urls) {
      const page = await analyzer.navigateToPage(url);
      try {
        const items = await analyzer.extractElementsFromPage(page, url);
        all.push(...items);
      } finally {
        await page.close().catch(() => {});
      }
    }

    console.log(`\n📦 total elements: ${all.length}`);
    if (!all.length) {
      console.log('No elements found. Check URLs and try again.');
      return;
    }

    console.log('\n🔍 computing similarities…');
    const sims = analyzer.findSimilarElements(all, CLI.minSim);

    let groups: GroupedElement[];
    if (!sims.length) {
      console.log('No similar elements. Building BasePage from recurring semantics…');
      groups = analyzer.createBasicGroups(all);
    } else {
      groups = analyzer.groupSimilar(sims);
    }

    console.log(`\n📊 groups: ${groups.length}`);
    analyzer.writeReport(groups, CLI.reportFile);
    analyzer.generateBasePage(groups, CLI.outFile);

    const baseCandidates = groups.filter(g => /BasePage/.test(g.pomRecommendation));
    console.log(`\n⭐ BasePage candidates: ${baseCandidates.length}`);
    baseCandidates.slice(0, 5).forEach((g, i) => {
      console.log(`  ${i + 1}. ${g.suggestedName} [${g.confidence}%]  → ${g.suggestedLocator}`);
    });

    console.log('\n✅ Done.');
  } catch (err) {
    console.error('❌ Analysis failed:', err);
    process.exitCode = 1;
  } finally {
    await analyzer.cleanup();
  }
}

main().catch(e => { console.error(e); process.exit(1); });