// Runs during HTML parsing so the saved theme applies before first paint.
// React warns in dev about rendering a <script> on the client, so the client
// render marks it text/plain (it never needs to run there); the type
// mismatch is suppressed (Next docs: preventing-flash-before-hydration).
export default function ThemeScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var t=localStorage.getItem("planner_theme");document.documentElement.dataset.theme=(t==="light"||t==="dark")?t:"dark";}catch(e){document.documentElement.dataset.theme="dark";}})();`,
      }}
    />
  );
}
