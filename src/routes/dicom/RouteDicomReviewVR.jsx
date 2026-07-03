import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { notify } from "@/lib/notify";
import { messages } from "@/lib/messages";

import {
  getIECsForDicomVR,
  getFilteredIECsForDicomVR,
  getValuesForDicomVR,
} from "@/utilities";
import { resetOptions, setLoading } from "@/features/optionSlice";
import { setVisualReviewConfig, reset } from "@/features/presentationSlice";
import DicomReviewVR from "@/features/dicom-review/DicomReviewVR";

import "./RouteDicomReviewVR.css";

export default function RouteDicomReviewVR() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const {
    vr,
    iec,
    reviewStatus: rawReviewStatus,
    dicomType: rawDicomType,
  } = useParams();
  const reviewStatus = rawReviewStatus || "All";
  const dicomType = rawDicomType || "All";
  const [iecList, setIecList] = useState(null);
  const [dicomTypeOptions, setDicomTypeOptions] = useState([]);

  // Prefetch filter lists so UI can populate immediately
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
    dispatch(setVisualReviewConfig());
    dispatch(setLoading(true));
  }, [vr, reviewStatus, dicomType, iec, dispatch]);

  // The IEC list depends only on the VR and filters — never clear or refetch
  // it on IEC navigation. Holding an arrow key navigates faster than a
  // refetch resolves, and with the list momentarily null every keypress
  // toasted "No next/previous IEC" long before the real ends.
  useEffect(() => {
    // Clear stale list to avoid redirecting with previous results
    setIecList(null);

    let stale = false;
    getFilteredIECsForDicomVR(vr, reviewStatus, dicomType)
      .then((iecs) => {
        if (stale) return;
        setIecList(iecs);
        if (Array.isArray(iecs) && iecs.length === 0) {
          // No results: stop loading and notify
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
  }, [vr, reviewStatus, dicomType, dispatch]);

  // If IEC is '*' or missing, redirect to the FIRST IEC once the list is known
  useEffect(() => {
    if ((iec !== "*" && iec) || !Array.isArray(iecList) || iecList.length === 0)
      return;
    const firstIec = idOf(iecList[0]);
    if (firstIec) {
      navigate(
        ["/review", "dicom", "vr", vr, firstIec, reviewStatus, dicomType].join(
          "/",
        ),
        { replace: true },
      );
    }
  }, [iec, iecList, vr, reviewStatus, dicomType, navigate]);

  // calculate the next and previous IECs (supports numbers or objects)
  const idOf = (item) => {
    if (item == null) return null;
    if (typeof item === "string" || typeof item === "number")
      return String(item);
    return String(
      item.image_equivalence_class_id ?? item.IEC ?? item.id ?? item.value,
    );
  };

  let offset = null;
  let nextIECId = null;
  let previousIECId = null;

  if (iecList && iec) {
    const currentId = String(iec);
    offset = iecList.findIndex((it) => idOf(it) === currentId);
    const nextOffset = offset + 1;
    const previousOffset = offset - 1;

    if (nextOffset >= 0 && nextOffset < iecList.length) {
      nextIECId = idOf(iecList[nextOffset]);
    }

    if (previousOffset >= 0 && previousOffset < iecList.length) {
      previousIECId = idOf(iecList[previousOffset]);
    }
  }

  const handleNext = () => {
    if (nextIECId) {
      console.log("Navigating to next IEC:", nextIECId);
      navigate(
        `/review/dicom/vr/${vr}/${nextIECId}/${reviewStatus}/${dicomType}`,
      );
    } else {
      notify.info(messages.navigation.noNext("IEC"));
    }
  };

  const handlePrevious = () => {
    if (previousIECId) {
      navigate(
        `/review/dicom/vr/${vr}/${previousIECId}/${reviewStatus}/${dicomType}`,
      );
    } else {
      notify.info(messages.navigation.noPrevious("IEC"));
    }
  };

  // Always render the page; when IEC isn't resolved yet or list is empty, pass iec=null
  const resolvedIec = iec && iec !== "*" ? iec : null;
  const noIecs = Array.isArray(iecList) && iecList.length === 0;

  return (
    <DicomReviewVR
      vr={vr}
      iec={resolvedIec}
      noIecs={noIecs}
      reviewStatus={reviewStatus}
      dicomType={dicomType}
      dicomTypeOptions={dicomTypeOptions}
      onNext={handleNext}
      onPrevious={handlePrevious}
    />
  );
}
