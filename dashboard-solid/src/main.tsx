/* @refresh reload */
import { lazy } from "solid-js";
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import { App } from "./App";
import { WidgetsRoute } from "./routes/v2/widgets";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found in index.html");

// Project route is lazy-loaded — it pulls in chat-solid, xterm,
// v2-solid-widgets, and addons. Keeping it out of the home-route
// bundle keeps /v2/widgets light.
const ProjectRoute = lazy(() => import("./routes/v2/project/[name]"));

render(
  () => (
    <Router root={App}>
      <Route path="/" component={WidgetsRoute} />
      <Route path="/v2" component={WidgetsRoute} />
      <Route path="/v2/widgets" component={WidgetsRoute} />
      <Route path="/v2/project/:name" component={ProjectRoute} />
    </Router>
  ),
  root,
);
