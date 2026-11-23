import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initWebApp, applyTheme } from "@/lib/telegram";

initWebApp();
applyTheme();

createRoot(document.getElementById("root")!).render(<App />);
