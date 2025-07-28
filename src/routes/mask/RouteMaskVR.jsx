import React, { useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";

import { setOption, resetOptions } from "@/features/optionSlice";
import { setMaskerConfig, reset } from "@/features/presentationSlice";

import MaskVR from "@/features/mask/MaskVR";

import { getIECsForVR } from "@/utilities";

import "./RouteMaskVR.css";

const PUBLIC_URL = process.env.PUBLIC_URL || "/mira";

export default function RouteMaskVR() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { vr, iec } = useParams();
  const iecList = useSelector((state) => state.options.iecList);

  useEffect(() => {
    dispatch(resetOptions());
    dispatch(reset());
    dispatch(setMaskerConfig());

    console.log("[RouteMaskVR] useEffect running, vr=", vr, "iec=", iec);
    if (!iecList) {
      console.log("[RouteMaskVR] No iecList found, fetching IECs for VR:", vr);
      getIECsForVR(vr).then((iecs) => {
        dispatch(setOption({ key: "iecList", value: iecs }));
      });
    } else {
      if (iec === undefined) {
        console.log("No iec provided, navigating to first IEC.", iecList);
        navigate(`/mask/vr/${vr}/${iecList[0]}`);
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

  // TODO or should we pass the next/previous IECs directly and allow
  // MaskVR to handle the navigation?
  const handleNext = () => {
    if (nextIEC) {
      console.log("Navigating to next IEC:", nextIEC);
      navigate(`/mask/vr/${vr}/${nextIEC}`);
      // window.location.assign(`${PUBLIC_URL}/mask/vr/${vr}/${nextIEC}`);
    } else {
      alert("No next IEC");
    }
  };

  const handlePrevious = () => {
    if (previousIEC) {
      navigate(`/mask/vr/${vr}/${previousIEC}`);
    } else {
      alert("No previous IEC");
    }
  };

  return <MaskVR vr={vr} iec={iec} onNext={handleNext} onPrevious={handlePrevious} nextIEC={nextIEC} />;
}
