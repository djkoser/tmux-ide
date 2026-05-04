import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NavigatorSlot } from "../NavigatorSlot";
import {
  NavigatorPortal,
  __resetNavigatorSlotForTests,
} from "@/lib/useNavigatorSlot";
import { NAVIGATOR_WIDTH } from "@/lib/panel-constants";

describe("NavigatorSlot", () => {
  afterEach(() => {
    __resetNavigatorSlotForTests();
  });

  it("renders nothing when no portal has registered", () => {
    const { container } = render(<NavigatorSlot />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the portal node with NAVIGATOR_WIDTH when a portal mounts", () => {
    render(
      <>
        <NavigatorPortal>
          <div data-testid="nav-content">hello</div>
        </NavigatorPortal>
        <NavigatorSlot />
      </>,
    );

    expect(screen.getByTestId("nav-content")).toBeTruthy();
    const slot = screen.getByTestId("navigator-slot");
    expect(slot.style.width).toBe(`${NAVIGATOR_WIDTH}px`);
  });

  it("hides the slot when hidden=true even with a registered portal", () => {
    const { container } = render(
      <>
        <NavigatorPortal>
          <div data-testid="nav-content">hello</div>
        </NavigatorPortal>
        <NavigatorSlot hidden />
      </>,
    );

    expect(container.querySelector('[data-testid="navigator-slot"]')).toBeNull();
  });

  it("LIFO: most recently mounted portal wins, restores previous on unmount", () => {
    function Outer({ showInner }: { showInner: boolean }) {
      return (
        <>
          <NavigatorPortal>
            <div data-testid="outer">outer</div>
          </NavigatorPortal>
          {showInner && (
            <NavigatorPortal>
              <div data-testid="inner">inner</div>
            </NavigatorPortal>
          )}
          <NavigatorSlot />
        </>
      );
    }

    const { rerender } = render(<Outer showInner={true} />);
    expect(screen.queryByTestId("inner")).toBeTruthy();
    expect(screen.queryByTestId("outer")).toBeNull();

    rerender(<Outer showInner={false} />);
    expect(screen.queryByTestId("inner")).toBeNull();
    expect(screen.queryByTestId("outer")).toBeTruthy();
  });

  it("unregisters cleanly when the portal unmounts", () => {
    function Wrapper({ show }: { show: boolean }) {
      return (
        <>
          {show && (
            <NavigatorPortal>
              <div data-testid="nav-content">hello</div>
            </NavigatorPortal>
          )}
          <NavigatorSlot />
        </>
      );
    }

    const { rerender, container } = render(<Wrapper show={true} />);
    expect(screen.queryByTestId("nav-content")).toBeTruthy();

    rerender(<Wrapper show={false} />);
    expect(container.querySelector('[data-testid="navigator-slot"]')).toBeNull();
  });
});
