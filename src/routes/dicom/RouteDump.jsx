/**
 * TODO: This whole route is probably temporary
 */
import React, { useLayoutEffect } from "react";
import { useLoaderData } from "react-router-dom";
import { useDispatch } from "react-redux";
import { setTitle } from "@/features/optionSlice";

import DicomDump from "@/components/DicomDump";

export async function loader({ params }) {
  return { file_id: params.file_id };
}

export default function RouteDump({ data }) {
  const { file_id } = useLoaderData();
  const dispatch = useDispatch();

  useLayoutEffect(() => {
    dispatch(setTitle("Experimental DICOM Dump"));
  }, []);

  return (
    <div className="route-dump">
      <DicomDump file_id={file_id} />
    </div>
  );
}
