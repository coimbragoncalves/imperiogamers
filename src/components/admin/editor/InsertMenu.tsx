import { Editor } from '@tiptap/react';
import { 
  Image as ImageIcon, 
  Youtube, 
  Minus, 
  Heading1, 
  Heading2, 
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code
} from 'lucide-react';
import { useRef, useEffect, useState } from 'react';

interface InsertMenuProps {
  position: { top: number; left: number };
  onClose: () => void;
  onInsertImage: (file?: File, url?: string) => void;
  onInsertYoutube: (url: string) => void;
  onInsertDivider: () => void;
  editor: Editor;
}

export const InsertMenu = ({ 
  position, 
  onClose, 
  onInsertImage,
  onInsertYoutube,
  onInsertDivider,
  editor 
}: InsertMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showYoutubeInput, setShowYoutubeInput] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [showImageUrlInput, setShowImageUrlInput] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onInsertImage(file);
    }
  };

  const menuItems = [
    {
      icon: <Heading1 className="h-4 w-4" />,
      label: 'Título H1',
      action: () => {
        editor.chain().focus().toggleHeading({ level: 1 }).run();
        onClose();
      }
    },
    {
      icon: <Heading2 className="h-4 w-4" />,
      label: 'Título H2',
      action: () => {
        editor.chain().focus().toggleHeading({ level: 2 }).run();
        onClose();
      }
    },
    {
      icon: <Heading3 className="h-4 w-4" />,
      label: 'Título H3',
      action: () => {
        editor.chain().focus().toggleHeading({ level: 3 }).run();
        onClose();
      }
    },
    {
      icon: <List className="h-4 w-4" />,
      label: 'Lista',
      action: () => {
        editor.chain().focus().toggleBulletList().run();
        onClose();
      }
    },
    {
      icon: <ListOrdered className="h-4 w-4" />,
      label: 'Lista Numerada',
      action: () => {
        editor.chain().focus().toggleOrderedList().run();
        onClose();
      }
    },
    {
      icon: <Quote className="h-4 w-4" />,
      label: 'Citação',
      action: () => {
        editor.chain().focus().toggleBlockquote().run();
        onClose();
      }
    },
    {
      icon: <Code className="h-4 w-4" />,
      label: 'Código',
      action: () => {
        editor.chain().focus().toggleCodeBlock().run();
        onClose();
      }
    },
    {
      icon: <ImageIcon className="h-4 w-4" />,
      label: 'Imagem (Upload)',
      action: () => fileInputRef.current?.click()
    },
    {
      icon: <ImageIcon className="h-4 w-4" />,
      label: 'Imagem (URL)',
      action: () => setShowImageUrlInput(true)
    },
    {
      icon: <Youtube className="h-4 w-4" />,
      label: 'Vídeo YouTube',
      action: () => setShowYoutubeInput(true)
    },
    {
      icon: <Minus className="h-4 w-4" />,
      label: 'Divisor',
      action: onInsertDivider
    },
  ];

  if (showYoutubeInput) {
    return (
      <div
        ref={menuRef}
        className="fixed z-50 bg-card border border-border rounded-lg shadow-xl p-3 min-w-[300px]"
        style={{ top: position.top, left: position.left }}
      >
        <p className="text-sm font-medium mb-2">URL do YouTube</p>
        <input
          type="url"
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm mb-2"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && youtubeUrl) {
              onInsertYoutube(youtubeUrl);
            }
            if (e.key === 'Escape') onClose();
          }}
        />
        <div className="flex gap-2">
          <button
            onClick={() => youtubeUrl && onInsertYoutube(youtubeUrl)}
            className="flex-1 bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm font-medium"
          >
            Inserir
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  if (showImageUrlInput) {
    return (
      <div
        ref={menuRef}
        className="fixed z-50 bg-card border border-border rounded-lg shadow-xl p-3 min-w-[300px]"
        style={{ top: position.top, left: position.left }}
      >
        <p className="text-sm font-medium mb-2">URL da Imagem</p>
        <input
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://..."
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm mb-2"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && imageUrl) {
              onInsertImage(undefined, imageUrl);
            }
            if (e.key === 'Escape') onClose();
          }}
        />
        <div className="flex gap-2">
          <button
            onClick={() => imageUrl && onInsertImage(undefined, imageUrl)}
            className="flex-1 bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm font-medium"
          >
            Inserir
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-card border border-border rounded-lg shadow-xl py-2 min-w-[200px] max-h-[400px] overflow-y-auto"
      style={{ top: position.top, left: position.left }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      {menuItems.map((item, index) => (
        <button
          key={index}
          type="button"
          onClick={item.action}
          className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted transition-colors text-left"
        >
          <span className="text-muted-foreground">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
};
