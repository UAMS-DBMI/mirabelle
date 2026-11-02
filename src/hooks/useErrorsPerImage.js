import { useLayoutEffect } from "react";
import { useMatches } from "react-router-dom";

import { notify } from "@/lib/notify";

function imageOnScreen({ iec, file }) {
  if (iec) return `iec-${iec}`;
  if (file) return `file-${file}`;
  return null;
}

/**
 * Keeps error toasts with the image they were raised on: an IEC or a NIfTI
 * file, whichever the route's params name. Moving to another image, by Next,
 * Previous or any other way, takes the last image's errors off the screen and
 * brings back this one's.
 *
 * A layout effect, so the switch comes before the page's own effects, which
 * raise the errors of the image just opened.
 */
export default function useErrorsPerImage() {
  const image = imageOnScreen(useMatches().at(-1)?.params ?? {});

  useLayoutEffect(() => {
    notify.showErrorsFor(image);
  }, [image]);
}
