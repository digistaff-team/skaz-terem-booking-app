export type Step = "room" | "date" | "time" | "details" | "confirm";

export const STEP_ORDER: Step[] = ["room", "date", "time", "details", "confirm"];

// На iOS нативный date/time спиннер вызывает onChange при каждом повороте колеса,
// поэтому для iOS используем onBlur (срабатывает только после нажатия «Готово»).
export const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
