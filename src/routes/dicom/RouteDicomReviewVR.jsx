import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch } from 'react-redux'
import toast from 'react-hot-toast';

import { getIECsForVR } from '@/utilities';
import { resetOptions, setLoading } from "@/features/optionSlice";
import { setVisualReviewConfig, reset } from "@/features/presentationSlice";
import DicomReviewVR from '@/features/dicom-review/DicomReviewVR';

import './RouteDicomReviewVR.css';

export default function RouteDicomReviewVR() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { vr, iec } = useParams();  

  const [iecList, setIecList] = useState(null);

  useEffect(() => {
    dispatch(resetOptions());
    dispatch(reset());
    dispatch(setVisualReviewConfig());
    dispatch(setLoading(true));

    if (!iecList) {
      getIECsForVR(vr).then((iecs) => {
        // this should trigger a re-run of this effect
        setIecList(iecs);
      });
    } else {
      if (iec === undefined) {
        console.log("No iec provided, navigating to first IEC.");
        navigate(`/review/dicom/vr/${vr}/${iecList[0]}`);
      } else {
        console.log("[RouteDicomReviewVR] useEffect running, vr=", vr, "iec=", iec);
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
      navigate(`/review/dicom/vr/${vr}/${nextIEC}`);
    } else {
      toast.error("No next IEC available.");
    }
  };

  const handlePrevious = () => {
    if (previousIEC) {
      navigate(`/review/dicom/vr/${vr}/${previousIEC}`);
    } else {
      toast.error("No previous IEC available.");
    }
  };

  return <DicomReviewVR vr={vr} iec={iec} onNext={handleNext} onPrevious={handlePrevious} />;
}