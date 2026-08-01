import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import { Extension } from '@tiptap/core'
import { Bold, Italic, Strikethrough, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, List, ListOrdered, Quote, ImageIcon, AlignLeft, AlignCenter, AlignRight, Type, Captions, HelpCircle, Link as LinkIcon } from 'lucide-react'

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] } },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize.replace(/['"]+/g, ''),
            renderHTML: attributes => {
              if (!attributes.fontSize) return {}
              return { style: `font-size: ${attributes.fontSize}` }
            },
          },
        },
      },
    ]
  },
  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }: { chain: any }) => {
        return chain().setMark('textStyle', { fontSize }).run()
      },
      unsetFontSize: () => ({ chain }: { chain: any }) => {
        return chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
      },
    }
  },
})

const MenuBar = ({ editor }: { editor: any }) => {
  if (!editor) {
    return null
  }

  const addImage = () => {
    const handleImageInsert = (url: string) => {
        let alt = window.prompt('Enter image description (Alt Text) for SEO/accessibility:');
        
        if (!alt) {
            if (window.confirm('Warning: Missing Alt Text is bad for SEO. Leave it blank anyway?')) {
                // Try to auto-generate from adjacent text
                const { from, to } = editor.state.selection;
                const before = editor.state.doc.textBetween(Math.max(0, from - 100), from, ' ');
                const after = editor.state.doc.textBetween(to, Math.min(editor.state.doc.content.size, to + 100), ' ');
                const adjacentText = (before + ' ' + after).replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().substring(0, 50);
                alt = adjacentText || 'Article Image';
            } else {
                alt = window.prompt('Please enter image description (Alt Text):') || 'Article Image';
            }
        }

        editor.chain().focus().setImage({ src: url, alt: alt }).run();
    };

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (file) {
            const formData = new FormData();
            formData.append('file', file);
            
            try {
                const res = await fetch('/api/upload', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.url) {
                    handleImageInsert(data.url);
                } else {
                    alert('Upload failed: ' + data.error);
                }
            } catch (err) {
                alert('Upload failed.');
            }
        }
    };
    
    if (window.confirm('Click OK to upload an image, or Cancel to enter a URL directly.')) {
        input.click();
    } else {
        const url = window.prompt('Enter image URL:');
        if (url) {
            handleImageInsert(url);
        }
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b border-border bg-muted/30 rounded-t-md">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run()}
        className={`p-2 rounded-md hover:bg-muted text-foreground transition-colors ${editor.isActive('bold') ? 'bg-muted shadow-sm' : ''}`}
        type="button"
        title="Bold"
      >
        <Bold className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
        className={`p-2 rounded-md hover:bg-muted text-foreground transition-colors ${editor.isActive('italic') ? 'bg-muted shadow-sm' : ''}`}
        type="button"
        title="Italic"
      >
        <Italic className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        disabled={!editor.can().chain().focus().toggleStrike().run()}
        className={`p-2 rounded-md hover:bg-muted text-foreground transition-colors ${editor.isActive('strike') ? 'bg-muted shadow-sm' : ''}`}
        type="button"
        title="Strikethrough"
      >
        <Strikethrough className="w-4 h-4" />
      </button>
      
      <div className="w-px h-6 bg-border mx-1"></div>

      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={`p-2 rounded-md hover:bg-muted text-foreground transition-colors ${editor.isActive('heading', { level: 1 }) ? 'bg-muted shadow-sm' : ''}`}
        type="button"
        title="Heading 1"
      >
        <Heading1 className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`p-2 rounded-md hover:bg-muted text-foreground transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-muted shadow-sm' : ''}`}
        type="button"
        title="Heading 2"
      >
        <Heading2 className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={`p-2 rounded-md hover:bg-muted text-foreground transition-colors ${editor.isActive('heading', { level: 3 }) ? 'bg-muted shadow-sm' : ''}`}
        type="button"
        title="Heading 3"
      >
        <Heading3 className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
        className={`p-2 rounded-md hover:bg-muted text-foreground transition-colors ${editor.isActive('heading', { level: 4 }) ? 'bg-muted shadow-sm' : ''}`}
        type="button"
        title="Heading 4"
      >
        <Heading4 className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 5 }).run()}
        className={`p-2 rounded-md hover:bg-muted text-foreground transition-colors ${editor.isActive('heading', { level: 5 }) ? 'bg-muted shadow-sm' : ''}`}
        type="button"
        title="Heading 5"
      >
        <Heading5 className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 6 }).run()}
        className={`p-2 rounded-md hover:bg-muted text-foreground transition-colors ${editor.isActive('heading', { level: 6 }) ? 'bg-muted shadow-sm' : ''}`}
        type="button"
        title="Heading 6"
      >
        <Heading6 className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`p-2 rounded-md hover:bg-muted text-foreground transition-colors ${editor.isActive('bulletList') ? 'bg-muted shadow-sm' : ''}`}
        type="button"
        title="Bullet List"
      >
        <List className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`p-2 rounded-md hover:bg-muted text-foreground transition-colors ${editor.isActive('orderedList') ? 'bg-muted shadow-sm' : ''}`}
        type="button"
        title="Ordered List"
      >
        <ListOrdered className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`p-2 rounded-md hover:bg-muted text-foreground transition-colors ${editor.isActive('blockquote') ? 'bg-muted shadow-sm' : ''}`}
        type="button"
        title="Blockquote"
      >
        <Quote className="w-4 h-4" />
      </button>

      <div className="w-px h-6 bg-border mx-1"></div>
      
      <select 
        onChange={(e) => {
            if(e.target.value) {
                // @ts-ignore
                editor.chain().focus().setFontSize(e.target.value).run()
            } else {
                // @ts-ignore
                editor.chain().focus().unsetFontSize().run()
            }
        }}
        value={editor.getAttributes('textStyle')?.fontSize || ''}
        className="h-8 text-sm bg-background border border-border rounded-md px-2 focus:outline-none"
      >
        <option value="">Size (Auto)</option>
        <option value="12px">12px</option>
        <option value="14px">14px</option>
        <option value="16px">16px</option>
        <option value="18px">18px</option>
        <option value="20px">20px</option>
        <option value="24px">24px</option>
        <option value="30px">30px</option>
        <option value="36px">36px</option>
        <option value="48px">48px</option>
      </select>

      <input
        type="color"
        onInput={(e) => editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()}
        value={editor.getAttributes('textStyle')?.color || '#000000'}
        className="w-8 h-8 p-0 border-0 bg-transparent rounded cursor-pointer shrink-0"
        title="Text Color"
      />

      <div className="w-px h-6 bg-border mx-1"></div>

      <button
        onClick={() => {
          const previousUrl = editor.getAttributes('link').href
          const url = window.prompt('Enter URL:', previousUrl)
          if (url === null) return
          if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run()
            return
          }
          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
        }}
        className={`p-2 rounded-md hover:bg-muted text-foreground transition-colors ${editor.isActive('link') ? 'bg-muted shadow-sm' : ''}`}
        type="button"
        title="Insert Link"
      >
        <LinkIcon className="w-4 h-4" />
      </button>

      <div className="w-px h-6 bg-border mx-1"></div>
      
      <button
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        className={`p-2 rounded-md hover:bg-muted text-foreground transition-colors ${editor.isActive({ textAlign: 'left' }) ? 'bg-muted shadow-sm' : ''}`}
        type="button"
        title="Align Left"
      >
        <AlignLeft className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        className={`p-2 rounded-md hover:bg-muted text-foreground transition-colors ${editor.isActive({ textAlign: 'center' }) ? 'bg-muted shadow-sm' : ''}`}
        type="button"
        title="Align Center"
      >
        <AlignCenter className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        className={`p-2 rounded-md hover:bg-muted text-foreground transition-colors ${editor.isActive({ textAlign: 'right' }) ? 'bg-muted shadow-sm' : ''}`}
        type="button"
        title="Align Right"
      >
        <AlignRight className="w-4 h-4" />
      </button>
      
      <div className="w-px h-6 bg-border mx-1"></div>

      <button
        onClick={addImage}
        className="p-2 rounded-md hover:bg-muted text-foreground transition-colors"
        type="button"
        title="Insert Image"
      >
        <ImageIcon className="w-4 h-4" />
      </button>

      <div className="w-px h-6 bg-border mx-1"></div>

      <button
        onClick={() => {
            const title = window.prompt('Enter FAQ Question (Title):') || 'Question';
            editor.chain().focus().insertContent(`\n[faq title="${title}"]Answer goes here...[/faq]\n`).run();
        }}
        className="p-2 rounded-md hover:bg-muted text-foreground transition-colors"
        type="button"
        title="Insert FAQ"
      >
        <HelpCircle className="w-4 h-4" />
      </button>
    </div>
  )
}

const ImageBubbleMenu = ({ editor }: { editor: any }) => {
    if (!editor) return null;

    const editAlt = () => {
        const currentAlt = editor.getAttributes('image').alt || '';
        const newAlt = window.prompt('Update Alt Text:', currentAlt);
        if (newAlt !== null) {
            editor.chain().focus().updateAttributes('image', { alt: newAlt }).run();
        }
    };

    const editCaption = () => {
        const currentTitle = editor.getAttributes('image').title || '';
        const newTitle = window.prompt('Enter Image Caption:', currentTitle);
        if (newTitle !== null) {
            editor.chain().focus().updateAttributes('image', { title: newTitle }).run();
        }
    };

    return (
        <BubbleMenu 
            editor={editor} 
            // @ts-ignore
            tippyOptions={{ duration: 100 }} 
            shouldShow={({ editor }) => editor.isActive('image')}
        >
            <div className="flex bg-background border border-border shadow-md rounded-md overflow-hidden p-1 gap-1">
                <button
                    onClick={() => editor.chain().focus().updateAttributes('image', { style: 'float: left; margin: 0 1rem 1rem 0;' }).run()}
                    className={`p-1.5 text-xs font-medium rounded hover:bg-muted transition-colors flex items-center gap-1 ${editor.getAttributes('image').style?.includes('float: left') ? 'bg-primary/10 text-primary' : ''}`}
                    type="button"
                    title="Align Left"
                >
                    <AlignLeft className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={() => editor.chain().focus().updateAttributes('image', { style: 'display: block; margin: 1rem auto;' }).run()}
                    className={`p-1.5 text-xs font-medium rounded hover:bg-muted transition-colors flex items-center gap-1 ${editor.getAttributes('image').style?.includes('display: block') ? 'bg-primary/10 text-primary' : ''}`}
                    type="button"
                    title="Align Center"
                >
                    <AlignCenter className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={() => editor.chain().focus().updateAttributes('image', { style: 'float: right; margin: 0 0 1rem 1rem;' }).run()}
                    className={`p-1.5 text-xs font-medium rounded hover:bg-muted transition-colors flex items-center gap-1 ${editor.getAttributes('image').style?.includes('float: right') ? 'bg-primary/10 text-primary' : ''}`}
                    type="button"
                    title="Align Right"
                >
                    <AlignRight className="w-3.5 h-3.5" />
                </button>
                
                <div className="w-px bg-border my-1 mx-1"></div>
                
                <button
                    onClick={editAlt}
                    className="p-1.5 text-xs font-medium rounded hover:bg-muted transition-colors flex items-center gap-1"
                    type="button"
                >
                    <Type className="w-3.5 h-3.5" /> Alt Text
                </button>
                
                <button
                    onClick={editCaption}
                    className="p-1.5 text-xs font-medium rounded hover:bg-muted transition-colors flex items-center gap-1"
                    type="button"
                >
                    <Captions className="w-3.5 h-3.5" /> Caption
                </button>
            </div>
        </BubbleMenu>
    );
};

import { useState } from 'react';

export default function Editor({ content, onChange }: { content: string, onChange?: (content: string) => void }) {
  const [htmlContent, setHtmlContent] = useState(content || '<p>Start writing your article...</p>');

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer',
        },
      }),
      TextStyle,
      Color,
      FontSize,
      Image.extend({
          addAttributes() {
              return {
                  ...this.parent?.(),
                  style: {
                      default: 'display: block; margin: 1rem auto;',
                      parseHTML: element => element.getAttribute('style'),
                      renderHTML: attributes => {
                          if (!attributes.style) return {};
                          return { style: attributes.style };
                      }
                  }
              }
          }
      }).configure({
          inline: true,
          HTMLAttributes: {
              class: 'editor-image rounded-md shadow-sm max-w-full h-auto',
          }
      })
    ],
    content: htmlContent,
    onUpdate: ({ editor }) => {
      setHtmlContent(editor.getHTML());
      if (onChange) {
        onChange(editor.getHTML());
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose-base dark:prose-invert focus:outline-none min-h-[400px] max-w-none p-4',
      },
    },
  })

  return (
    <div className="border border-input rounded-md overflow-hidden bg-background focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-colors shadow-sm">
      <MenuBar editor={editor} />
      <ImageBubbleMenu editor={editor} />
      <EditorContent editor={editor} />
      <input type="hidden" name="content" value={htmlContent} />
    </div>
  )
}
