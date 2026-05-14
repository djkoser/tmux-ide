/* @refresh reload */
import { lazy } from "solid-js";
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import { App } from "./App";
import { WidgetsRoute } from "./routes/v2/widgets";
import ProjectsHomeRoute from "./routes/index";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found in index.html");

// Heavy routes are lazy-loaded — the project shell pulls in chat-solid,
// xterm, v2-solid-widgets, and the widget mirror + standalone terminal
// pull in xterm. Keeping them out of the home-route bundle keeps
// /v2/widgets light.
const ProjectRoute = lazy(() => import("./routes/v2/project/[name]"));
const SetupRoute = lazy(() => import("./routes/v2/setup"));
const SettingsRoute = lazy(() => import("./routes/v2/settings"));
const TerminalRoute = lazy(() => import("./routes/v2/terminal/[id]"));
const WidgetRoute = lazy(() => import("./routes/v2/widget/[name]"));

render(
  () => (
    <Router root={App}>
      <Route path="/" component={ProjectsHomeRoute} />
      <Route path="/v2" component={ProjectsHomeRoute} />
      <Route path="/v2/widgets" component={WidgetsRoute} />
      <Route path="/v2/setup" component={SetupRoute} />
      <Route path="/v2/settings" component={SettingsRoute} />
      <Route path="/v2/project/:name" component={ProjectRoute} />
      <Route path="/v2/terminal/:id" component={TerminalRoute} />
      <Route path="/v2/widget/:name" component={WidgetRoute} />
    </Router>
  ),
  root,
);
