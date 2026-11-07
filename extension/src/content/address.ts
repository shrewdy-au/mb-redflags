// Reads ONLY the listing's address (hackathon rule: no listing text, price or photos).
// JSON-LD first, then site DOM selectors. Selectors and parsing adapted from the MOGL scraper (copied, not imported).
import type { AddressInfo } from '../lib/types';

const text = (selector: string): string | undefined => {
  const el = document.querySelector(selector);
  if (!el) return undefined;
  return (el.textContent || '').replace(/\s+/g, ' ').trim() || undefined;
};

export const extractJsonLdData = () => {
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  for (const script of scripts) {
    try {
      if (!script.textContent) continue;
      const parsed = JSON.parse(script.textContent);
      const items = Array.isArray(parsed) ? parsed : parsed?.['@graph'] ? parsed['@graph'] : [parsed];
      for (const item of items) {
        if (item && typeof item === 'object' && (item.address || item['@type']?.toString().toLowerCase().includes('residence'))) {
          return item as Record<string, any>;
        }
      }
    } catch {
      // ignore malformed ld+json chunks
    }
  }
  return undefined;
};

export const parseAddressParts = (fullAddress?: string) => {
  if (!fullAddress) return {} as { addressLine?: string; suburb?: string; state?: string; postcode?: string };
  const normalized = fullAddress.replace(/\s+/g, ' ').trim();
  const commaParts = normalized.split(',').map((segment) => segment.trim());
  let street: string | undefined = commaParts[0];
  let suburb: string | undefined = commaParts[1];
  let state: string | undefined;
  let postcode: string | undefined;

  const tailMatch = normalized.match(/(.+)\s+([A-Z]{2,3})\s*(\d{4})$/i);
  if (tailMatch) {
    const head = tailMatch[1].trim();
    state = tailMatch[2].toUpperCase();
    postcode = tailMatch[3];
    const parts = head.split(',').map((s) => s.trim());
    if (parts.length > 1) { suburb = parts.pop(); street = parts.join(', '); }
  }
  const suburbMatch = suburb?.match(/^([A-Za-z\s'-]+?)\s+([A-Z]{2,3})\s*(\d{4})?$/);
  if (suburbMatch) {
    suburb = suburbMatch[1].trim();
    state = state || suburbMatch[2]?.toUpperCase();
    postcode = postcode || suburbMatch[3];
  }
  return { addressLine: street, suburb, state, postcode };
};

/** '3/12 Smith St' -> unit 3, number 12, street 'Smith St'. Also 'Unit 3, 12 Smith St' and '12A Smith St'. */
export function splitStreet(line: string) {
  const s = line.replace(/\s+/g, ' ').trim();
  let m = s.match(/^(?:unit|apt|apartment|flat|shop|suite)\s*([\w-]+)\s*[,/]?\s*(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\s+(.+)$/i);
  if (m) return { unit: m[1], number: m[2], streetName: m[3] };
  m = s.match(/^([\w-]+)\s*\/\s*(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\s+(.+)$/);
  if (m) return { unit: m[1], number: m[2], streetName: m[3] };
  m = s.match(/^(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\s+(.+)$/);
  if (m) return { number: m[1], streetName: m[2] };
  return { streetName: s };
}

export function buildAddressInfo(raw: string, hint?: { street?: string; suburb?: string; state?: string; postcode?: string }): AddressInfo | undefined {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned || /address (available )?on request|contact agent/i.test(cleaned)) return undefined;
  const p = parseAddressParts(cleaned);
  const street = hint?.street || p.addressLine;
  const suburb = hint?.suburb || p.suburb;
  const state = hint?.state || p.state || 'NSW';
  const postcode = hint?.postcode || p.postcode;
  if (!street) return undefined;
  const parts = splitStreet(street);
  const tail = [suburb, state, postcode].filter(Boolean).join(' ');
  const candidates: string[] = [];
  if (parts.unit && parts.number) {
    candidates.push(`${parts.unit}/${parts.number} ${parts.streetName}, ${tail}`);
    candidates.push(`Unit ${parts.unit} ${parts.number} ${parts.streetName}, ${tail}`);
  } else {
    candidates.push(`${street}, ${tail}`);
  }
  return { raw: cleaned, street, suburb, state, postcode, ...parts, candidates: [...new Set(candidates)] };
}

export function readListingAddress(): AddressInfo | undefined {
  // 1) JSON-LD
  const ld = extractJsonLdData();
  const addr = ld?.address;
  if (addr) {
    if (typeof addr === 'string') {
      const info = buildAddressInfo(addr);
      if (info) return info;
    } else if (typeof addr === 'object' && addr.streetAddress) {
      const raw = [addr.streetAddress, addr.addressLocality, [addr.addressRegion, addr.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      const info = buildAddressInfo(raw, { street: addr.streetAddress, suburb: addr.addressLocality, state: addr.addressRegion, postcode: addr.postalCode });
      if (info) return info;
    }
  }
  // 2) DOM selectors per site
  const host = location.hostname;
  let raw: string | undefined;
  if (host.includes('realestate.com.au')) {
    raw = text('[itemprop="address"]') || text('.property-info-address') || text('[data-testid="listing-details__summary-title-address"]') || text('[data-testid="listing-summary__address"]');
  } else if (host.includes('domain.com.au')) {
    raw = text('.listing-details__address') || text('[data-testid="listing-details__button-copy-wrapper"] h1') || text('.left-wrap h1');
  }
  return raw ? buildAddressInfo(raw) : undefined;
}
