import React, { useLayoutEffect } from "react";
import { useLoaderData } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { resetOptions } from "@/features/optionSlice";

import NiftiReviewFile from "@/features/nifti-review/NiftiReviewFile";

import { setVisualReviewConfig, reset } from "@/features/presentationSlice";

import "./RouteNiftiReviewFile.css";

export async function loader({ params }) {
  return { file: params.file };
}

export default function RouteNiftiReviewFile() {
  const dispatch = useDispatch();
  const viewState = useSelector((state) => state.options.view);

  let { file } = useLoaderData();

  // A layout effect, so this reset runs before NiftiReviewFile's load effect
  // configures the tools (child effects run before the parent's). As a plain
  // effect it ran after, wiping the View, Crosshairs, Preset and Opacity
  // controls and the title.
  useLayoutEffect(() => {
    dispatch(resetOptions());
    dispatch(reset());
    dispatch(setVisualReviewConfig());
  }, []);

  return <NiftiReviewFile file={file} />;
}
