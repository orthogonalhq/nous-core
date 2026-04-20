/**
 * Server-side card extractor — parses inline card XML from response text
 * into structured card data for tool-call-compatible delivery.
 *
 * This is the bridge between the legacy inline-XML card delivery and the
 * structured card delivery format. Cards extracted here populate the
 * `cards` field on ChatTurnResult, allowing the UI to render cards from
 * structured data instead of parsing XML at render time.
 */

import type { CardToolCall } from './card-tool-definitions.js';

const CARD_TAG_NAMES = ['StatusCard', 'ActionCard', 'ApprovalCard', 'WorkflowCard', 'FollowUpBlock'];

/**
 * Extract structured card data from a response string containing inline card XML.
 *
 * Handles two formats:
 * - Self-closing: `<StatusCard title="..." status="active" />`
 * - With children: `<StatusCard title="...">content</StatusCard>`
 *
 * Props are extracted from attributes: `key="stringValue"` and `key={jsonValue}`.
 */
export function extractCardsFromResponse(response: string): CardToolCall[] {
  const cards: CardToolCall[] = [];

  for (const tagName of CARD_TAG_NAMES) {
    // Match both self-closing and paired tags
    const selfClosingRegex = new RegExp(`<${tagName}\\s([^>]*?)\\s*/>`, 'g');
    const pairedRegex = new RegExp(`<${tagName}\\s([^>]*?)>([\\s\\S]*?)</${tagName}>`, 'g');

    let match: RegExpExecArray | null;

    // Self-closing tags
    while ((match = selfClosingRegex.exec(response)) !== null) {
      const props = parseTagAttributes(match[1]);
      if (props) cards.push({ type: tagName, props });
    }

    // Paired tags (content between open/close is ignored for props)
    while ((match = pairedRegex.exec(response)) !== null) {
      const props = parseTagAttributes(match[1]);
      if (props) cards.push({ type: tagName, props });
    }
  }

  return cards;
}

/**
 * Parse tag attributes from an attribute string.
 * Handles: `key="value"` and `key={jsonValue}`.
 */
function parseTagAttributes(attrString: string): Record<string, unknown> | null {
  const props: Record<string, unknown> = {};

  // Match key="stringValue"
  const stringAttrRegex = /(\w+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = stringAttrRegex.exec(attrString)) !== null) {
    props[match[1]] = match[2];
  }

  // Match key={jsonValue}
  const jsonAttrRegex = /(\w+)=\{([\s\S]*?)\}(?=\s|$|\/)/g;
  while ((match = jsonAttrRegex.exec(attrString)) !== null) {
    try {
      props[match[1]] = JSON.parse(match[2]);
    } catch {
      props[match[1]] = match[2];
    }
  }

  return Object.keys(props).length > 0 ? props : null;
}
