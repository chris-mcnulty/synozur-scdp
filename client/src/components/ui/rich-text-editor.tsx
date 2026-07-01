import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

export function RichTextEditor({ content, onChange, placeholder, className }: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChangeRef.current(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "min-h-[120px] outline-none prose prose-sm dark:prose-invert max-w-none p-3",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current !== content) {
      editor.commands.setContent(content, false);
    }
  }, [editor, content]);

  if (!editor) return null;

  const toolbarBtn = (active: boolean, onClick: () => void, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={label}
      className={cn(
        "h-7 w-7 flex items-center justify-center rounded transition-colors",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {icon}
    </button>
  );

  return (
    <div className={cn("rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring", className)}>
      <div className="flex items-center gap-0.5 border-b px-2 py-1">
        {toolbarBtn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "Bold", <Bold className="h-3.5 w-3.5" />)}
        {toolbarBtn(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "Italic", <Italic className="h-3.5 w-3.5" />)}
        {toolbarBtn(editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), "Bullet list", <List className="h-3.5 w-3.5" />)}
      </div>
      <EditorContent editor={editor} />
      {!editor.getText() && placeholder && (
        <p className="pointer-events-none absolute px-3 py-3 text-sm text-muted-foreground select-none">{placeholder}</p>
      )}
    </div>
  );
}
