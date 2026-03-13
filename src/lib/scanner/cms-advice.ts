/**
 * CMS-specific advice for common issues.
 * Maps issue codes to platform-specific fix instructions.
 */

type CMSAdvice = Record<string, string>;

const WORDPRESS_ADVICE: CMSAdvice = {
  missing_meta_description: `Install Yoast SEO or Rank Math plugin, then edit your page and fill in the "SEO Description" field.`,
  missing_title: `Install Yoast SEO plugin. Go to the page editor and fill in the "SEO Title" field in the Yoast meta box.`,
  no_structured_data: `Install Yoast SEO (includes Article schema) or Schema Pro plugin. For custom schema, use the WPCode plugin to add JSON-LD.`,
  missing_viewport: `Add this to your theme's header.php in the <head> section, or use a child theme to avoid losing changes on update.`,
  missing_lang_attribute: `In functions.php, ensure your site has a language set: Settings > General > Site Language.`,
  missing_llms_txt: `Upload llms.txt to your WordPress root directory via FTP/SFTP, or use WPCode plugin to create a virtual file.`,
  missing_organization_schema: `Yoast SEO: Go to SEO > Search Appearance > Content Types. Rank Math: Go to Schema settings.`,
  large_dom: `Consider using WP Rocket for lazy loading, deactivate unused plugins, and switch to a lightweight theme like Astra or GeneratePress.`,
  no_cdn_detected: `Use Cloudflare (free tier), or enable CDN in your hosting (SiteGround, WP Engine have built-in CDN).`,
  missing_h1: `Check your theme - some themes use site title as H1. Edit the page and ensure your main heading uses the Heading 1 block.`,
};

const SHOPIFY_ADVICE: CMSAdvice = {
  missing_meta_description: `Go to Online Store > Pages > Edit page, then fill in the "Description" field under "Search engine listing preview".`,
  missing_title: `Edit the page/product and update the "Page title" field under "Search engine listing preview".`,
  no_structured_data: `Shopify includes Product schema by default. For additional schema, edit theme.liquid or use an app like JSON-LD for SEO.`,
  missing_viewport: `This should be in your theme.liquid by default. Check your theme or contact Shopify support.`,
  missing_llms_txt: `Create a page at /pages/llms-txt and set up a URL redirect, or use Shopify Files to host a static llms.txt.`,
  missing_organization_schema: `Use the JSON-LD for SEO app, or add Organization schema manually in your theme.liquid file.`,
  large_dom: `Reduce product variants displayed, use Shopify's lazy loading for images, minimize app injections on the page.`,
  missing_h1: `Edit your theme to ensure product/page titles render as H1. Go to Online Store > Themes > Edit code.`,
};

const WEBFLOW_ADVICE: CMSAdvice = {
  missing_meta_description: `Select your page in the Pages panel, then fill in the "Meta Description" field in the SEO Settings tab.`,
  missing_title: `Select the page, open SEO Settings, and fill in the "Title Tag" field.`,
  no_structured_data: `Use Webflow's native CMS for collections (adds automatic schema), or add custom JSON-LD in Page Settings > Custom Code.`,
  missing_viewport: `Webflow includes this by default. If missing, add via Page Settings > Custom Code > Head Code.`,
  missing_llms_txt: `Host your llms.txt on a CDN and add a redirect in Project Settings > Hosting > 301 Redirects.`,
  missing_organization_schema: `Add Organization JSON-LD in Project Settings > Custom Code > Head Code.`,
  large_dom: `Simplify your design with fewer nested divs, use Webflow's built-in lazy loading, and consider using Webflow's native components.`,
  missing_h1: `Select your heading element and change its tag to H1 in the Settings panel (right side).`,
};

const NEXTJS_ADVICE: CMSAdvice = {
  missing_meta_description: `Use next/head or the new Metadata API in app router. Add: export const metadata = { description: '...' } in your page.tsx.`,
  missing_title: `Use the Metadata API: export const metadata = { title: '...' } or the Head component from next/head.`,
  no_structured_data: `Add JSON-LD in your layout or page using a <script type="application/ld+json"> tag with dangerouslySetInnerHTML.`,
  missing_viewport: `Next.js should include this by default. Check your custom _document.tsx or app/layout.tsx.`,
  missing_llms_txt: `Create public/llms.txt - Next.js serves files from the public folder automatically.`,
  large_dom: `Use React.lazy() for code splitting, implement virtual scrolling for long lists, and optimize component re-renders.`,
  missing_h1: `Ensure your page component includes an <h1> element. Check your layout and page components.`,
};

const WIX_ADVICE: CMSAdvice = {
  missing_meta_description: `Go to Marketing & SEO > SEO Tools > SEO Settings, or click "SEO" in the page settings panel.`,
  missing_title: `Edit the page, click the menu icon (...) > SEO Basics, and update the title.`,
  no_structured_data: `Use Wix's built-in SEO tools or add custom schema via Marketing & SEO > SEO Tools > Markup Helper.`,
  missing_llms_txt: `Wix doesn't support custom root files. Consider using an external redirect or hosting llms.txt elsewhere.`,
  large_dom: `Reduce the number of elements on the page, use Wix's native lazy loading, and avoid complex animations.`,
  missing_h1: `Click on your main heading element and change its style to "Heading 1" in the text settings.`,
};

const SQUARESPACE_ADVICE: CMSAdvice = {
  missing_meta_description: `Edit the page, go to the gear icon > SEO, and fill in the "SEO Description" field.`,
  missing_title: `Page Settings (gear icon) > SEO > SEO Title.`,
  no_structured_data: `Squarespace includes basic schema. For custom schema, add JSON-LD via Settings > Advanced > Code Injection.`,
  missing_llms_txt: `Use Settings > Advanced > Code Injection or host the file externally with a redirect.`,
  large_dom: `Use fewer content blocks, optimize images, and consider removing complex galleries or animations.`,
  missing_h1: `Edit your heading block and set it to "Heading 1" style in the text formatting toolbar.`,
};

const CMS_ADVICE_MAP: Record<string, CMSAdvice> = {
  'WordPress': WORDPRESS_ADVICE,
  'Shopify': SHOPIFY_ADVICE,
  'Webflow': WEBFLOW_ADVICE,
  'Next.js': NEXTJS_ADVICE,
  'Wix': WIX_ADVICE,
  'Squarespace': SQUARESPACE_ADVICE,
};

/**
 * Get CMS-specific advice for an issue code.
 * Returns the platform-specific advice if available, or null if not.
 */
export function getCMSAdvice(issueCode: string, detectedTechs: Array<{ name: string }>): string | null {
  // Find the first matching CMS/framework
  for (const tech of detectedTechs) {
    const advice = CMS_ADVICE_MAP[tech.name]?.[issueCode];
    if (advice) {
      return advice;
    }
  }
  return null;
}

/**
 * Enhance an issue's howToFix with CMS-specific advice.
 */
export function enhanceWithCMSAdvice<T extends { code: string; howToFix: string | null }>(
  issue: T,
  detectedTechs: Array<{ name: string }>
): T {
  if (!issue.howToFix) return issue;

  const cmsAdvice = getCMSAdvice(issue.code, detectedTechs);
  if (!cmsAdvice) return issue;

  // Find the CMS name for the label
  const cmsName = detectedTechs.find(t => CMS_ADVICE_MAP[t.name]?.[issue.code])?.name || 'your platform';

  return {
    ...issue,
    howToFix: `${issue.howToFix}\n\n**${cmsName}:** ${cmsAdvice}`,
  };
}
