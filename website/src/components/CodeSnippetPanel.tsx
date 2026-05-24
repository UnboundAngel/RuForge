import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { IconPillTooltip } from './ui/icon-pill-tooltip';

export interface CodeSnippetPanelProps {
  file: string;
  languageLabel: string;
  lineHint: string;
  caption: string;
  html: string;
}

function splitFilePath(file: string): { dir: string; base: string; ext: string } {
  const slash = file.lastIndexOf('/');
  const dir = slash === -1 ? '' : file.slice(0, slash + 1);
  const name = slash === -1 ? file : file.slice(slash + 1);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) {
    return { dir, base: name, ext: '' };
  }
  return { dir, base: name.slice(0, dot), ext: name.slice(dot) };
}

export default function CodeSnippetPanel({
  file,
  languageLabel,
  lineHint,
  caption,
  html,
}: CodeSnippetPanelProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { dir, base, ext } = splitFilePath(file);

  return (
    <article className={`rf-code-panel${open ? ' rf-code-panel--open' : ''}`}>
      <button
        type="button"
        className="rf-code-panel__header"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <IconPillTooltip
          label={file}
          variant="path"
          uppercase={false}
          className="min-w-0 flex-1 overflow-hidden"
        >
          <span className="rf-code-panel__path">
            {dir ? <span className="rf-code-panel__dir">{dir}</span> : null}
            <span className="rf-code-panel__name">{base}</span>
            {ext ? <span className="rf-code-panel__ext">{ext}</span> : null}
          </span>
        </IconPillTooltip>
        <span className="rf-code-panel__aside">
          <span className="rf-code-panel__hint">
            {languageLabel}
            <span className="rf-code-panel__sep" aria-hidden>
              {' '}
              ·{' '}
            </span>
            {lineHint}
          </span>
          <ChevronDown
            className={`rf-code-panel__chevron${open ? ' rf-code-panel__chevron--open' : ''}`}
            size={14}
            strokeWidth={1.75}
            aria-hidden
          />
        </span>
      </button>
      <div
        id={panelId}
        className="rf-code-panel__drawer"
        role="region"
        aria-label={`Source code for ${file}`}
      >
        <div className="rf-code-panel__drawer-inner rf-scrollbar">
          {open ? <p className="rf-code-panel__caption">{caption}</p> : null}
          <div className="rf-code-panel__code" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </article>
  );
}
