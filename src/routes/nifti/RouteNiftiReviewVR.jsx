import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import toast from "react-hot-toast";

import { getFilesForNiftiVR } from "@/utilities";
import { resetOptions, setLoading } from "@/features/optionSlice";
import { setVisualReviewConfig, reset } from "@/features/presentationSlice";
import NiftiReviewVR from "@/features/nifti-review/NiftiReviewVR";

import "./RouteNiftiReviewVR.css";

export default function RouteNiftiReviewVR() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { vr, file } = useParams();

  const [fileList, setFileList] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded) {
      return;
    }
    dispatch(resetOptions());
    dispatch(reset());
    dispatch(setVisualReviewConfig());
    dispatch(setLoading(true));

    if (!fileList) {
      getFilesForNiftiVR(vr).then((files) => {
        // this should trigger a re-run of this effect
        setFileList(files);
      });
    } else {
      if (file === undefined) {
        console.log("No file provided, navigating to first File.");
        navigate(`/review/nifti/vr/${vr}/${fileList[0]}`);
      } else {
        console.log(
          "[RouteNiftiReviewVR] useEffect running, vr=",
          vr,
          "file=",
          file,
          fileList,
        );
        setLoaded(true);
      }
    }
  }, [vr, file, fileList]);

  // calculate the next and previous IECs
  let offset = null;
  let nextFile = null;
  let previousFile = null;

  if (fileList && file) {
    const fileNumber = parseInt(file);
    offset = fileList.indexOf(fileNumber);
    const nextOffset = offset + 1;
    const previousOffset = offset - 1;

    if (nextOffset < fileList.length) {
      nextFile = fileList[nextOffset];
    }

    if (previousOffset >= 0) {
      previousFile = fileList[previousOffset];
    }
  }

  const handleNext = () => {
    if (nextFile) {
      console.log("Navigating to next File:", nextFile);
      navigate(`/review/nifti/vr/${vr}/${nextFile}`);
    } else {
      toast.error("No next File available.");
    }
  };

  const handlePrevious = () => {
    if (previousFile) {
      navigate(`/review/nifti/vr/${vr}/${previousFile}`);
    } else {
      toast.error("No previous File available.");
    }
  };

  if (!loaded) {
    return null;
  }

  return (
    <NiftiReviewVR
      vr={vr}
      file={file}
      onNext={handleNext}
      onPrevious={handlePrevious}
    />
  );
}
