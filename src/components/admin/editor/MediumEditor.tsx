import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Youtube from '@tiptap/extension-youtube';
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { EditorToolbar } from './EditorToolbar';
import { InsertMenu } from './InsertMenu';
import './editor-styles.css';

interface MediumEditorProps {
  content: string;
  onChange: (html: string, json: object) => void;
}

const MediumEditor = ({ content, onChange }: MediumEditorProps) => {
  const { toast } = useToast();
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const [insertMenuPosition, setInsertMenuPosition] = useState({ top: 0, left: 0 });
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ top: 0, left: 0 });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'editor-image',
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'editor-link',
        },
      }),
      Placeholder.configure({
        placeholder: 'Comece a escrever ou pressione "/" para inserir...',
      }),
      Underline,
      Youtube.configure({
        width: 640,
        height: 360,
        HTMLAttributes: {
          class: 'editor-youtube',
        },
      }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const json = editor.getJSON();
      onChange(html, json);
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      if (from !== to) {
        // Text is selected
        const coords = editor.view.coordsAtPos(from);
        setToolbarPosition({ 
          top: coords.top - 50, 
          left: Math.max(coords.left, 100) 
        });
        setShowToolbar(true);
      } else {
        setShowToolbar(false);
      }
    },
    editorProps: {
      attributes: {
        class: 'medium-editor-content',
      },
      handleKeyDown: (view, event) => {
        if (event.key === '/') {
          const { from } = view.state.selection;
          const coords = view.coordsAtPos(from);
          setInsertMenuPosition({ top: coords.top + 24, left: coords.left });
          setShowInsertMenu(true);
          return false;
        }
        if (showInsertMenu && event.key === 'Escape') {
          setShowInsertMenu(false);
          return true;
        }
        return false;
      },
    },
  });

  const handleImageUpload = useCallback(async (file: File) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(`articles/${fileName}`, file);

    if (uploadError) {
      toast({ title: 'Erro ao fazer upload', variant: 'destructive' });
      return null;
    }

    const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(`articles/${fileName}`);
    return urlData.publicUrl;
  }, [toast]);

  const insertImage = useCallback(async (file?: File, url?: string) => {
    if (!editor) return;
    
    let imageUrl = url;
    if (file) {
      imageUrl = await handleImageUpload(file);
    }
    
    if (imageUrl) {
      editor.chain().focus().setImage({ src: imageUrl }).run();
    }
    setShowInsertMenu(false);
  }, [editor, handleImageUpload]);

  const insertYoutube = useCallback((url: string) => {
    if (!editor) return;
    editor.commands.setYoutubeVideo({ src: url });
    setShowInsertMenu(false);
  }, [editor]);

  const insertDivider = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().setHorizontalRule().run();
    setShowInsertMenu(false);
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="medium-editor-wrapper">
      {/* Floating toolbar on text selection */}
      {showToolbar && (
        <div 
          className="fixed z-50"
          style={{ top: toolbarPosition.top, left: toolbarPosition.left }}
        >
          <EditorToolbar editor={editor} />
        </div>
      )}

      {/* Insert Menu (/ command or + button) */}
      {showInsertMenu && (
        <InsertMenu
          position={insertMenuPosition}
          onClose={() => setShowInsertMenu(false)}
          onInsertImage={insertImage}
          onInsertYoutube={insertYoutube}
          onInsertDivider={insertDivider}
          editor={editor}
        />
      )}

      {/* Plus button on empty lines */}
      <div className="editor-container">
        <button
          type="button"
          className="insert-plus-button"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setInsertMenuPosition({ top: rect.bottom + 8, left: rect.left });
            setShowInsertMenu(!showInsertMenu);
          }}
        >
          +
        </button>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default MediumEditor;
