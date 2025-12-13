import { Editor } from '@tiptap/react';
import { 
  Bold, 
  Italic, 
  Underline, 
  Link as LinkIcon, 
  Heading1, 
  Heading2, 
  Quote 
} from 'lucide-react';
import { useState } from 'react';

interface EditorToolbarProps {
  editor: Editor;
}

export const EditorToolbar = ({ editor }: EditorToolbarProps) => {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const setLink = () => {
    if (linkUrl) {
      editor.chain().focus().setLink({ href: linkUrl }).run();
    }
    setShowLinkInput(false);
    setLinkUrl('');
  };

  if (showLinkInput) {
    return (
      <div className="flex items-center gap-2 bg-card border border-border rounded-lg p-2 shadow-lg">
        <input
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://..."
          className="bg-transparent border-none outline-none text-sm px-2 py-1 w-48"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') setLink();
            if (e.key === 'Escape') setShowLinkInput(false);
          }}
        />
        <button 
          onClick={setLink}
          className="text-primary hover:text-primary/80 text-sm font-medium"
        >
          OK
        </button>
        <button 
          onClick={() => setShowLinkInput(false)}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1 shadow-lg">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="Negrito"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="Itálico"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        title="Sublinhado"
      >
        <Underline className="h-4 w-4" />
      </ToolbarButton>
      
      <div className="w-px h-5 bg-border mx-1" />
      
      <ToolbarButton
        onClick={() => setShowLinkInput(true)}
        isActive={editor.isActive('link')}
        title="Link"
      >
        <LinkIcon className="h-4 w-4" />
      </ToolbarButton>
      
      <div className="w-px h-5 bg-border mx-1" />
      
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive('heading', { level: 1 })}
        title="Título H1"
      >
        <Heading1 className="h-4 w-4" />
      </ToolbarButton>
      
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
        title="Título H2"
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        title="Citação"
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
};

interface ToolbarButtonProps {
  onClick: () => void;
  isActive: boolean;
  title: string;
  children: React.ReactNode;
}

const ToolbarButton = ({ onClick, isActive, title, children }: ToolbarButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`p-2 rounded transition-colors ${
      isActive 
        ? 'bg-primary text-primary-foreground' 
        : 'hover:bg-muted text-foreground'
    }`}
  >
    {children}
  </button>
);
