import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import toast from 'react-hot-toast';

import { getIECsForVRAwaitingReview } from "@/utilities";
import { resetOptions, setLoading } from "@/features/optionSlice";
import { setMaskerReviewConfig, reset } from "@/features/presentationSlice";
import MaskReviewVR from "@/features/mask-review/MaskReviewVR";

import "./RouteMaskReviewVR.css";

export default function RouteMaskReviewVR() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { vr, iec } = useParams();

  const [iecList, setIecList] = useState(null);

  useEffect(() => {
    dispatch(resetOptions());
    dispatch(reset());
    dispatch(setMaskerReviewConfig());
    dispatch(setLoading(true));

    if (!iecList) {
      getIECsForVRAwaitingReview(vr).then((iecs) => {
        // this should trigger a re-run of this effect
        setIecList(iecs);
      });
    } else {
      if (iec === undefined) {
        console.log("No iec provided, navigating to first IEC.");
        navigate(`/mask/review/vr/${vr}/${iecList[0]}`);
      } else {
        console.log("[RouteMaskReviewVR] useEffect running, vr=", vr, "iec=", iec);
      }
    }
  }, [vr, iec, iecList]);

  // calculate the next and previous IECs
  let offset = null;
  let nextIEC = null;
  let previousIEC = null;

  if (iecList && iec) {
    const iecNumber = parseInt(iec);
    offset = iecList.indexOf(iecNumber);
    const nextOffset = offset + 1;
    const previousOffset = offset - 1;

    if (nextOffset < iecList.length) {
      nextIEC = iecList[nextOffset];
    }

    if (previousOffset >= 0) {
      previousIEC = iecList[previousOffset];
    }
  }

  const handleNext = () => {
    if (nextIEC) {
      console.log("Navigating to next IEC:", nextIEC);
      navigate(`/mask/review/vr/${vr}/${nextIEC}`);
      // window.location.assign(`${PUBLIC_URL}/mask/review/vr/${vr}/${nextIEC}`);
    } else {
      toast.error("No next IEC available.");
    }
  };

  const handlePrevious = () => {
    if (previousIEC) {
      navigate(`/mask/review/vr/${vr}/${previousIEC}`);
    } else {
      toast.error("No previous IEC available.");
    }
  };

  return <MaskReviewVR vr={vr} iec={iec} onNext={handleNext} onPrevious={handlePrevious} />;
}
