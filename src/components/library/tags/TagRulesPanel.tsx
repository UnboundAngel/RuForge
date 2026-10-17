import { useEffect, useRef, useState } from "react";
import { AlignLeft, ChevronDown, CircleUserRound, Equal, Plus, TextSearch, Trash2, Type, WandSparkles } from "lucide-react";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MusicFloatingMenu,
  MusicMenuRow,
  MusicMenuSection,
  menuAnchorPoint,
  type MenuAt,
} from "@/components/music/musicMenuUi";
import { Switch } from "@/components/ui/Switch";
import {
  TAG_RULE_FIELDS,
  TAG_RULE_OPS,
  newTagEntityId,
  type LibraryTag,
  type TagRule,
  type TagRuleField,
  type TagRuleOp,
} from "@/lib/libraryTags";
import { updateLibraryTags, useLibraryTags } from "@/lib/libraryTagsStore";
import { runTagRulesOnLibrary } from "@/lib/libraryTagSync";
import { cn } from "@/lib/utils";

export const RULE_FIELD_ICONS: Record<TagRuleField, typeof Type> = {
  title: Type,
  channel: CircleUserRound,
  description: AlignLeft,
};

export const RULE_OP_ICONS: Record<TagRuleOp, typeof Type> = {
  includes: TextSearch,
  is: Equal,
};

const OP_MENU_LABEL: Record<TagRuleOp, string> = { includes: "includes", is: "is exactly" };

function patchRule(id: string, patch: Partial<TagRule>): void {
  updateLibraryTags((s) => ({ ...s, rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
}

/** Rerun after a change; the count toast only when the rule can tag something. */
function rerun(rule: TagRule | undefined, announce: boolean): void {
  const live = rule && rule.enabled && rule.tagId && rule.text.trim();
  void runTagRulesOnLibrary(announce && live ? { announce: [rule.tagId] } : undefined);
}

function ruleById(id: string): TagRule | undefined {
  return useLibraryTags.getState().rules.find((r) => r.id === id);
}

function editRule(id: string, patch: Partial<TagRule>): void {
  patchRule(id, patch);
  rerun(ruleById(id), true);
}

type OpenMenu = { ruleId: string; kind: "field" | "op"; at: MenuAt };

const TOKEN =
  "inline-flex h-7 items-center gap-1.5 rounded-full bg-white/[0.06] pl-2 pr-2 text-[12px] font-semibold text-stone-100 transition-colors hover:bg-white/[0.11] active:scale-[0.97]";

/**
 * The tag's own rules, on its page: each reads "When title includes minecraft" and tags this tag.
 * New rules go to the end of the global list, which only matters when two game rules match one video.
 */
export function TagRulesPanel({ tag }: { tag: LibraryTag }) {
  const allRules = useLibraryTags((s) => s.rules);
  const rules = allRules.filter((r) => r.tagId === tag.id);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const menuRule = menu ? rules.find((r) => r.id === menu.ruleId) : undefined;
  const closeMenu = () => setMenu(null);

  const addRule = () => {
    const rule: TagRule = {
      id: newTagEntityId("rule"),
      field: "title",
      op: "includes",
      text: rules.length ? "" : tag.name,
      tagId: tag.id,
      enabled: true,
    };
    updateLibraryTags((s) => ({ ...s, rules: [...s.rules, rule] }));
    setFresh(rule.id);
    if (rule.text) rerun(rule, true);
  };

  return (
    <section aria-label={`Rules for ${tag.name}`} className="mb-10 rounded-[20px] bg-[color:var(--rf-well-raised)] p-4">
      <div className="flex items-center gap-3 pl-1">
        <WandSparkles size={15} strokeWidth={2.25} className="shrink-0 text-[color:var(--accent)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-bold text-stone-100">Auto-tag</h2>
          <p className="text-[12px] font-medium text-stone-500">
            {rules.length
              ? `Matching videos get ${tag.name}, now and on every download.`
              : `no rules yet. try one like: when title includes ${tag.name}`}
          </p>
        </div>
        <button
          type="button"
          onClick={addRule}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white/[0.06] px-3 text-[12px] font-semibold text-stone-200 transition-colors hover:bg-white/[0.11] active:scale-[0.97]"
        >
          <Plus size={13} strokeWidth={2.5} />
          Add rule
        </button>
      </div>

      {rules.length ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {rules.map((rule) => (
            <RuleRow key={rule.id} rule={rule} autoFocus={fresh === rule.id} openMenu={setMenu} />
          ))}
        </ul>
      ) : null}

      <MusicFloatingMenu
        open={menu?.kind === "field" && !!menuRule}
        x={menu?.at.x ?? 0}
        y={menu?.at.y ?? 0}
        placement={menu?.at.placement}
        theme="library"
        onClose={closeMenu}
        ariaLabel="Rule field"
      >
        <MusicMenuSection label="Look at" tone={MUSIC_MENU_TONES.navigate}>
          {TAG_RULE_FIELDS.map((f) => {
            const Icon = RULE_FIELD_ICONS[f.id];
            return (
              <MusicMenuRow
                key={f.id}
                tone={MUSIC_MENU_TONES.navigate}
                label={f.label}
                active={menuRule?.field === f.id}
                icon={<Icon size={MUSIC_MENU_ICON_SIZE} strokeWidth={2.25} />}
                onClick={() => {
                  closeMenu();
                  if (menuRule && menuRule.field !== f.id) editRule(menuRule.id, { field: f.id });
                }}
              />
            );
          })}
        </MusicMenuSection>
      </MusicFloatingMenu>

      <MusicFloatingMenu
        open={menu?.kind === "op" && !!menuRule}
        x={menu?.at.x ?? 0}
        y={menu?.at.y ?? 0}
        placement={menu?.at.placement}
        theme="library"
        onClose={closeMenu}
        ariaLabel="Rule match"
      >
        <MusicMenuSection label="Match" tone={MUSIC_MENU_TONES.navigate}>
          {TAG_RULE_OPS.map((o) => {
            const Icon = RULE_OP_ICONS[o.id];
            return (
              <MusicMenuRow
                key={o.id}
                tone={MUSIC_MENU_TONES.navigate}
                label={OP_MENU_LABEL[o.id]}
                active={menuRule?.op === o.id}
                icon={<Icon size={MUSIC_MENU_ICON_SIZE} strokeWidth={2.25} />}
                onClick={() => {
                  closeMenu();
                  if (menuRule && menuRule.op !== o.id) editRule(menuRule.id, { op: o.id });
                }}
              />
            );
          })}
        </MusicMenuSection>
      </MusicFloatingMenu>
    </section>
  );
}

function RuleRow({
  rule,
  autoFocus,
  openMenu,
}: {
  rule: TagRule;
  autoFocus: boolean;
  openMenu: (menu: OpenMenu) => void;
}) {
  const [draft, setDraft] = useState(rule.text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(rule.text), [rule.text]);

  const commitText = () => {
    const text = draft.trim();
    if (text === rule.text) {
      setDraft(text);
      return;
    }
    editRule(rule.id, { text });
  };

  const open = (kind: OpenMenu["kind"]) => (e: React.MouseEvent<HTMLButtonElement>) =>
    openMenu({ ruleId: rule.id, kind, at: { ...menuAnchorPoint(e.currentTarget, "start"), placement: "anchor" } });

  const FieldIcon = RULE_FIELD_ICONS[rule.field];
  const OpIcon = RULE_OP_ICONS[rule.op];
  const fieldLabel = TAG_RULE_FIELDS.find((f) => f.id === rule.field)?.label ?? rule.field;
  const opLabel = TAG_RULE_OPS.find((o) => o.id === rule.op)?.label ?? rule.op;

  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-[14px] bg-[color:var(--rf-field)] py-1.5 pl-3 pr-1.5 transition-opacity duration-150",
        !rule.enabled && "opacity-55",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[13px] font-medium text-stone-400">
        <span>When</span>
        <button type="button" className={TOKEN} onClick={open("field")} aria-label="Field to check">
          <FieldIcon size={13} strokeWidth={2.25} className="shrink-0 text-stone-400" />
          {fieldLabel}
          <ChevronDown size={12} className="shrink-0 text-stone-500" />
        </button>
        <button type="button" className={TOKEN} onClick={open("op")} aria-label="How to match">
          <OpIcon size={13} strokeWidth={2.25} className="shrink-0 text-stone-400" />
          {opLabel}
          <ChevronDown size={12} className="shrink-0 text-stone-500" />
        </button>
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") inputRef.current?.blur();
          }}
          placeholder="text"
          aria-label="Text to match"
          size={Math.max(6, Math.min(32, draft.length + 1))}
          className="h-7 min-w-0 rounded-full bg-white/[0.06] px-3 text-[12px] font-semibold text-[color:var(--accent)] outline-none transition-colors placeholder:font-medium placeholder:text-stone-600 hover:bg-white/[0.09] focus:bg-white/[0.11]"
        />
      </div>
      <Switch
        size="sm"
        checked={rule.enabled}
        label={rule.enabled ? "Turn rule off" : "Turn rule on"}
        onChange={(on) => {
          patchRule(rule.id, { enabled: on });
          rerun(ruleById(rule.id), on);
        }}
      />
      <button
        type="button"
        aria-label="Delete rule"
        data-tooltip="Delete rule"
        onClick={() => {
          updateLibraryTags((s) => ({ ...s, rules: s.rules.filter((r) => r.id !== rule.id) }));
          rerun(undefined, false);
        }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
      >
        <Trash2 size={MUSIC_MENU_ICON_SIZE} />
      </button>
    </li>
  );
}
