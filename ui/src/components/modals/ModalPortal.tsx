import { useDisableScroll } from "@velocity-exchange/react";
import { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";

interface ModalPortalProps {
  children: React.ReactNode;
  node?: any;
  id?: string;
}

const ModalPortal = (props: ModalPortalProps) => {
  const defaultNode = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useDisableScroll();

  useEffect(() => {
    if (mounted == false) {
      setMounted(true);
    }
  }, []);

  if (!defaultNode.current) {
    let portalDock = document.getElementById("modal-portal-dock");

    if (!portalDock) {
      portalDock = document.createElement("div");
      portalDock.id = "modal-portal-dock";
      document.body.appendChild(portalDock);
    }

    defaultNode.current = portalDock;
  }

  return mounted
    ? ReactDOM.createPortal(
        <div style={{ zIndex: 100, position: "absolute" }}>
          {props.children}
        </div>,
        defaultNode.current,
      )
    : null;
};

export default ModalPortal;
