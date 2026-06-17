import { useMemo } from 'react';
import AdDisplay from '@/components/ads/AdDisplay';

interface ArticleContentProps {
  html: string;
}

const CONTENT_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'UL', 'OL', 'BLOCKQUOTE', 'PRE',
]);

const ArticleContent = ({ html }: ArticleContentProps) => {
  const { topHtml, bottomHtml } = useMemo(() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstElementChild as HTMLDivElement;
    if (!root) return { topHtml: html, bottomHtml: '' };

    const nodes = Array.from(root.childNodes);
    const contentIndices: number[] = [];

    nodes.forEach((node, idx) => {
      if (node instanceof Element && CONTENT_TAGS.has(node.tagName)) {
        contentIndices.push(idx);
      }
    });

    // If not enough content blocks, just show full content without inline ad
    if (contentIndices.length < 6) {
      return { topHtml: html, bottomHtml: '' };
    }

    const midIndex = Math.floor(contentIndices.length / 2);
    const splitAt = contentIndices[midIndex];

    const topNodes = nodes.slice(0, splitAt);
    const bottomNodes = nodes.slice(splitAt);

    const topContainer = document.createElement('div');
    topNodes.forEach((n) => topContainer.appendChild(n.cloneNode(true)));

    const bottomContainer = document.createElement('div');
    bottomNodes.forEach((n) => bottomContainer.appendChild(n.cloneNode(true)));

    return { topHtml: topContainer.innerHTML, bottomHtml: bottomContainer.innerHTML };
  }, [html]);

  if (!bottomHtml) {
    return (
      <div
        className="prose prose-invert prose-lg max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div className="prose prose-invert prose-lg max-w-none">
      <div dangerouslySetInnerHTML={{ __html: topHtml }} />
      <div className="my-8 py-4 px-2 border-y border-dashed border-muted/30 bg-muted/5 rounded-sm">
        <AdDisplay position="article-middle" />
      </div>
      <div dangerouslySetInnerHTML={{ __html: bottomHtml }} />
    </div>
  );
};

export default ArticleContent;
