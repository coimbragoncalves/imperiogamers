import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Save, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import MediumEditor from './editor/MediumEditor';
import { ArticleMetaForm } from './editor/ArticleMetaForm';

const ArticleEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const isEditing = !!id;

  // Form states
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [slug, setSlug] = useState('');
  const [content, setContent] = useState('');
  const [contentJson, setContentJson] = useState<object>({});
  const [coverImage, setCoverImage] = useState('');
  const [contentType, setContentType] = useState<'news' | 'review' | 'other'>('news');
  const [isPublished, setIsPublished] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // Auto-save states
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const { data: article, isLoading } = useQuery({
    queryKey: ['article-edit', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: isEditing,
  });

  useEffect(() => {
    if (article) {
      setTitle(article.title);
      setSubtitle(article.description || '');
      setSlug(article.slug);
      setContent(article.content || '');
      setCoverImage(article.cover_image || '');
      setContentType(article.content_type as 'news' | 'review' | 'other');
      setIsPublished(article.is_published);
    }
  }, [article]);

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleCoverImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(`covers/${fileName}`, file);

    if (uploadError) {
      toast({ title: 'Erro ao fazer upload', variant: 'destructive' });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(`covers/${fileName}`);
    setCoverImage(urlData.publicUrl);
    setUploading(false);
    setIsDirty(true);
  };

  const handleEditorChange = useCallback((html: string, json: object) => {
    setContent(html);
    setContentJson(json);
    setIsDirty(true);
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const finalSlug = slug || generateSlug(title);
      const articleData = {
        title,
        slug: finalSlug,
        description: subtitle || metaDescription,
        content,
        cover_image: coverImage,
        content_type: contentType,
        is_published: isPublished,
        author_id: user?.id,
      };

      if (isEditing) {
        const { error } = await supabase
          .from('articles')
          .update(articleData)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('articles').insert(articleData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: isEditing ? 'Artigo atualizado!' : 'Artigo criado!' });
      setLastSaved(new Date());
      setIsDirty(false);
      navigate('/admin/artigos');
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Erro ao salvar', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Auto-save draft every 30 seconds
  useEffect(() => {
    if (!isDirty || !title) return;

    const timer = setTimeout(async () => {
      if (isEditing && id) {
        const { error } = await supabase
          .from('articles')
          .update({
            title,
            slug: slug || generateSlug(title),
            description: subtitle,
            content,
            cover_image: coverImage,
            content_type: contentType,
          })
          .eq('id', id);
        
        if (!error) {
          setLastSaved(new Date());
          setIsDirty(false);
        }
      }
    }, 30000);

    return () => clearTimeout(timer);
  }, [isDirty, title, subtitle, content, coverImage, contentType, slug, isEditing, id]);

  if (isLoading) {
    return <div className="text-center py-12">Carregando...</div>;
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/artigos')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-display font-bold hidden sm:block">
              {isEditing ? 'Editar Artigo' : 'Novo Artigo'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {lastSaved && (
              <span className="text-xs text-muted-foreground hidden sm:block">
                Salvo às {lastSaved.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
            >
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Preview</span>
            </Button>
            <Button
              variant="accent"
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={!title || saveMutation.isPending}
            >
              <Save className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </span>
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        <div className={`grid gap-6 ${showPreview ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
          {/* Sidebar - Meta form */}
          <div className={`${showPreview ? 'hidden lg:block' : 'lg:col-span-1'} order-2 lg:order-1`}>
            <div className="sticky top-20">
              <ArticleMetaForm
                title={title}
                setTitle={(v) => { setTitle(v); setIsDirty(true); }}
                subtitle={subtitle}
                setSubtitle={(v) => { setSubtitle(v); setIsDirty(true); }}
                slug={slug}
                setSlug={(v) => { setSlug(v); setIsDirty(true); }}
                contentType={contentType}
                setContentType={(v) => { setContentType(v); setIsDirty(true); }}
                coverImage={coverImage}
                onCoverImageUpload={handleCoverImageUpload}
                uploading={uploading}
                metaTitle={metaTitle}
                setMetaTitle={setMetaTitle}
                metaDescription={metaDescription}
                setMetaDescription={setMetaDescription}
                isPublished={isPublished}
                setIsPublished={(v) => { setIsPublished(v); setIsDirty(true); }}
              />
            </div>
          </div>

          {/* Main Editor */}
          <div className={`${showPreview ? 'lg:col-span-1' : 'lg:col-span-2'} order-1 lg:order-2`}>
            <MediumEditor
              content={content}
              onChange={handleEditorChange}
            />
          </div>

          {/* Preview */}
          {showPreview && (
            <div className="lg:col-span-1 order-3 hidden lg:block">
              <div className="sticky top-20 bg-card border border-border rounded-xl p-6 max-h-[calc(100vh-6rem)] overflow-y-auto">
                <h2 className="text-sm font-semibold text-muted-foreground mb-4">Preview</h2>
                {coverImage && (
                  <img 
                    src={coverImage} 
                    alt="Capa" 
                    className="w-full h-48 object-cover rounded-lg mb-4" 
                  />
                )}
                <h1 className="text-2xl font-bold mb-2">{title || 'Título do artigo'}</h1>
                {subtitle && <p className="text-muted-foreground mb-4">{subtitle}</p>}
                <div 
                  className="prose prose-invert prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: content || '<p>Comece a escrever...</p>' }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArticleEditor;
