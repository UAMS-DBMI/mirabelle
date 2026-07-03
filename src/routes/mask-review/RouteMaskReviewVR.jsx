import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { notify } from "@/lib/notify";
import { messages } from "@/lib/messages";

import {
  getFilteredIECsForMaskReviewVR,
  getValuesForDicomVR,
} from "@/utilities";
import { resetOptions, setLoading } from "@/features/optionSlice";
import { setMaskerReviewConfig, reset } from "@/features/presentationSlice";
import MaskReviewVR from "@/features/mask-review/MaskReviewVR";

import "./RouteMaskReviewVR.css";

export default function RouteMaskReviewVR() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const {
    vr,
    iec,
    maskingStatus: rawMaskingStatus,
    dicomType: rawDicomType,
  } = useParams();
  const maskingStatus = rawMaskingStatus || "All";
  const dicomType = rawDicomType || "All";

  const [iecList, setIecList] = useState(null);
  const [dicomTypeOptions, setDicomTypeOptions] = useState(["All"]);

  // Prefetch image-type options once per VR so the dropdown is populated
  // immediately and survives IEC navigation (avoids the per-mount fetch flicker).
  useEffect(() => {
    let mounted = true;
    getValuesForDicomVR(vr)
      .then((values) => {
        if (!mounted) return;
        const list = Array.from(
          new Set(
            (values?.dicom_file_types || [])
              .map((it) => it?.dicom_file_type)
              .filter(Boolean),
          ),
        );
        setDicomTypeOptions(["All", ...list]);
      })
      .catch(() => setDicomTypeOptions(["All"]));
    return () => {
      mounted = false;
    };
  }, [vr]);

  // Reset the per-exam UI state for every IEC (and filter change). Kept
  // separate from the list fetch below so IEC navigation doesn't refetch.
  useEffect(() => {
    dispatch(resetOptions());
    dispatch(reset());
    dispatch(setMaskerReviewConfig());
    dispatch(setLoading(true));
  }, [vr, maskingStatus, dicomType, iec, dispatch]);

  // The IEC list depends only on the VR and filters — never clear or refetch
  // it on IEC navigation. Holding an arrow key navigates faster than a
  // refetch resolves, and with the list momentarily null every keypress
  // toasted "No next/previous IEC" long before the real ends.
  useEffect(() => {
    setIecList(null);

    let stale = false;
    getFilteredIECsForMaskReviewVR(vr, maskingStatus, dicomType)
      .then((iecs) => {
        if (stale) return;
        setIecList(iecs);
        if (Array.isArray(iecs) && iecs.length === 0) {
          dispatch(setLoading(false));
          notify.info(messages.filters.noResults);
        }
      })
      .catch((error) => {
        if (stale) return;
        setIecList([]);
        dispatch(setLoading(false));
        notify.error(error, messages.filters.loadFailed);
      });

    return () => {
      stale = true;
    };
  }, [vr, maskingStatus, dicomType, dispatch]);

  // Send "*" (or a missing IEC) to the first IEC once the list is known.
  useEffect(() => {
    if ((iec === "*" || !iec) && Array.isArray(iecList) && iecList.length > 0) {
      navigate(
        `/mask/review/vr/${vr}/${iecList[0]}/${maskingStatus}/${dicomType}`,
        { replace: true },
      );
    }
  }, [iec, iecList, vr, maskingStatus, dicomType, navigate]);

  let nextIEC = null;
  let previousIEC = null;

  if (iecList && iec) {
    const iecNumber = parseInt(iec);
    const offset = iecList.indexOf(iecNumber);
    if (offset + 1 < iecList.length) nextIEC = iecList[offset + 1];
    if (offset - 1 >= 0) previousIEC = iecList[offset - 1];
  }

  const handleNext = () => {
    if (nextIEC) {
      navigate(
        `/mask/review/vr/${vr}/${nextIEC}/${maskingStatus}/${dicomType}`,
      );
    } else {
      notify.info(messages.navigation.noNext("IEC"));
    }
  };

  const handlePrevious = () => {
    if (previousIEC) {
      navigate(
        `/mask/review/vr/${vr}/${previousIEC}/${maskingStatus}/${dicomType}`,
      );
    } else {
      notify.info(messages.navigation.noPrevious("IEC"));
    }
  };

  const resolvedIec = iec && iec !== "*" ? iec : null;
  const noIecs = Array.isArray(iecList) && iecList.length === 0;

  return (
    <MaskReviewVR
      vr={vr}
      iec={resolvedIec}
      noIecs={noIecs}
      maskingStatus={maskingStatus}
      dicomType={dicomType}
      dicomTypeOptions={dicomTypeOptions}
      onNext={handleNext}
      onPrevious={handlePrevious}
    />
  );
}
