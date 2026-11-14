import { h } from "../lib/dom";

export function confirmDialog(title: string, body: string, confirmLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = h("dialog", { class: "modal", "aria-labelledby": "dlg-title" });
    if (typeof dlg.showModal !== "function") return resolve(window.confirm(`${title}\n\n${body}`));
    const done = (v: boolean): void => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    dlg.append(
      h("h2", { id: "dlg-title" }, title),
      h("p", {}, body),
      h("div", { class: "row end" },
        h("button", { class: "btn btn-ghost", type: "button", onclick: () => done(false) }, "Cancelar"),
        h("button", { class: "btn btn-danger", type: "button", onclick: () => done(true) }, confirmLabel)),
    );
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); done(false); });
    document.body.append(dlg);
    dlg.showModal();
  });
}
