import type { MindElixirInstance, Topic } from "mind-elixir";

/** Keep the engine's editing overlay visually identical to its topic. */
export function installInlineEditor(map: MindElixirInstance) {
  const original = map.editTopic;
  let editing: Topic | null = null;
  map.editTopic = function (topic: Topic) {
    const previous = map.nodes.querySelector<HTMLElement>("#input-box");
    if (previous) {
      if (editing === topic) {
        previous.focus();
        return;
      }
      previous.blur();
    }
    original.call(map, topic);
    const input = map.nodes.querySelector<HTMLElement>("#input-box");
    if (!input) return;
    editing = topic;
    const css = getComputedStyle(topic);
    Object.assign(input.style, {
      fontFamily: css.fontFamily,
      fontWeight: css.fontWeight,
      fontStyle: css.fontStyle,
      fontSize: css.fontSize,
      lineHeight: css.lineHeight,
      letterSpacing: css.letterSpacing,
      textAlign: css.textAlign,
      textDecoration: css.textDecoration,
      whiteSpace: css.whiteSpace,
      overflowWrap: css.overflowWrap,
      boxSizing: "border-box",
      minWidth: `${topic.offsetWidth}px`,
      minHeight: `${topic.offsetHeight}px`,
      maxWidth: css.maxWidth,
      backgroundColor: map.theme.cssVar["--bgcolor"],
    });
    input.setAttribute("role", "textbox");
    input.setAttribute("aria-label", "Nội dung node");
    input.setAttribute("aria-multiline", "true");
    // The engine reads innerText after detaching the editor. Normalize line
    // breaks while it is still rendered, so pasted/new multiline text survives.
    input.addEventListener(
      "blur",
      () => {
        input.textContent = input.innerText;
      },
      { capture: true, once: true },
    );
    topic.classList.add("editing-topic");
    input.addEventListener(
      "blur",
      () => {
        topic.classList.remove("editing-topic");
        editing = null;
      },
      { once: true },
    );
  };
}
