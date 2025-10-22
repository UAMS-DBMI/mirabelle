import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import toast from 'react-hot-toast';

import MaskVR from "@/features/mask/MaskVR";
import { setOption, resetOptions, setLoading } from "@/features/optionSlice";
import { setMaskerConfig, reset } from "@/features/presentationSlice";
import { getIECsForMaskVR } from "@/utilities";

import "./RouteMaskVR.css";

const PUBLIC_URL = process.env.PUBLIC_URL || "/mira";

export default function RouteMaskVR() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { vr, iec } = useParams();
  const [iecList, setIecList] = useState(null);

  useEffect(() => {
    dispatch(resetOptions());
    dispatch(reset());
    dispatch(setMaskerConfig());
    dispatch(setLoading(true));

    console.log("[RouteMaskVR] useEffect running, vr=", vr, "iec=", iec);
    if (!iecList) {
      console.log("[RouteMaskVR] No iecList found, fetching IECs for VR:", vr);
      getIECsForMaskVR(vr).then((iecs) => {
        setIecList(iecs);
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

  const handleNext = () => {
    if (nextIEC) {
      console.log("Navigating to next IEC:", nextIEC);
      navigate(`/mask/vr/${vr}/${nextIEC}`);
      // window.location.assign(`${PUBLIC_URL}/mask/vr/${vr}/${nextIEC}`);
    } else {
      toast.error("No next IEC available.");
    }
  };

  const handlePrevious = () => {
    if (previousIEC) {
      navigate(`/mask/vr/${vr}/${previousIEC}`);
    } else {
      toast.error("No previous IEC available.");
    }
  };

  return <MaskVR vr={vr} iec={iec} onNext={handleNext} onPrevious={handlePrevious} />;
}