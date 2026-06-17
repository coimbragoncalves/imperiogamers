import { useMemo } from 'react';
import AdDisplay from '@/components/ads/AdDisplay';

interface ArticleContentProps {
  html: string;
  adFrequency?: number; // insert ad every N content blocks
}

const CONTENT_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'UL', 'OL', 'BLOCKQUOTE', 'PRE',
]);

const ArticleContent = ({ html, adFrequency = 5 }: ArticleContentProps) => {
  const blocks = useMemo(() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstElementChild as HTMLDivElement;
    if (!root) return [];

    const nodes = Array.from(root.childNodes);
    const chunks: { type: 'html'; html: string }[] = [];
    let currentHtml = '';
    let contentCount = 0;

    for (const node of nodes) {
      currentHtml += (node as Element).outerHTML ?? (node as Text).textContent ?? '';

      if (node instanceof Element && CONTENT_TAGS.has(node.tagName)) {
        contentCount++;
      }

      if (contentCount >= adFrequency) {
        if (currentHtml.trim()) {
          chunks.push({ type: 'html', html: currentHtml });
        }
        contentCount = 0;
        currentHtml = '';
      }
    }

    if (currentHtml.trim()) {
      chunks.push({ type: 'html', html: currentHtml });
    }

    return chunks;
  }, [html, adFrequency]);

  if (blocks.length === 0) {
    return (
      <div
        className="prose prose-invert prose-lg max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div className="prose prose-invert prose-lg max-w-none">
      {blocks.map((block, idx) => (
        <div key={idx}>
          <div dangerouslySetInnerHTML={{ __html: block.html }} />
          {idx < blocks.length - 1 && (
            <div className="my-8 py-4 px-2 border-y border-dashed border-muted/30 bg-muted/5 rounded-sm">
              <AdDisplay position="article-inline" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ArticleContent;
