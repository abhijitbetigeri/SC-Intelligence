// Sanitized Markdown renderer for AI answers (komodos-chat-ui). react-markdown does NOT
// render raw HTML by default, so model output is safe to display. Styled by the `.md` rules.
// Every answer is treated as untrusted text — never innerHTML.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Markdown({ children }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{String(children || '')}</ReactMarkdown>
    </div>
  );
}
