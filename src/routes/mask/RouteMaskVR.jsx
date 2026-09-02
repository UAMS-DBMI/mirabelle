import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { notify } from "@/lib/notify";
import { messages } from "@/lib/messages";

import MaskVR from "@/features/mask/MaskVR";
import { resetOptions, setLoading } from "@/features/optionSlice";
import { setMaskerConfig, reset } from "@/features/presentationSlice";
import { getFilteredIECsForMaskVR, getValuesForMaskVR } from "@/utilities";

import "./RouteMaskVR.css";

export default function RouteMaskVR() {
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

  // The list is refetched on every IEC change (so filtered browsing reflects
  // work just submitted), but it must not be blanked while that is in flight:
  // next/previous are derived from it, and a null list mid-navigation looks
  // exactly like the ends of the list — the buttons dim and the hotkeys fire
  // the "no next/previous IEC" toast while the curator is still moving. Only a
  // genuinely different list (new VR or new filters) clears it, and a fetch
  // superseded by a later one is discarded rather than applied late.
  const listKey = `${vr}|${maskingStatus}|${dicomType}`;
  const listKeyRef = useRef(null);
  const listRequestRef = useRef(0);

  const [iecList, setIecList] = useState(null);
  const [dicomTypeOptions, setDicomTypeOptions] = useState(["All"]);

  // Prefetch image-type options once per VR so the dropdown is populated
  // immediately and survives IEC navigation (avoids the per-mount fetch flicker).
  useEffect(() => {
    let mounted = true;
    getValuesForMaskVR(vr)
      .then((values) => {
        if (!mounted) return;
        const types = Array.from(
          new Set(
            (values?.dicom_file_types || [])
              .map((it) => it?.dicom_file_type)
              .filter(Boolean),
          ),
        );
        setDicomTypeOptions(["All", ...types]);
      })
      .catch(() => setDicomTypeOptions(["All"]));
    return () => {
      mounted = false;
    };
  }, [vr]);

  useEffect(() => {
    dispatch(resetOptions());
    dispatch(reset());
    dispatch(setMaskerConfig());
    dispatch(setLoading(true));

    const requestId = ++listRequestRef.current;
    if (listKeyRef.current !== listKey) {
      listKeyRef.current = listKey;
      setIecList(null);
    }

    getFilteredIECsForMaskVR(vr, maskingStatus, dicomType)
      .then((iecs) => {
        if (requestId !== listRequestRef.current) return; // superseded
        setIecList(iecs);
        if (Array.isArray(iecs) && iecs.length === 0) {
          dispatch(setLoading(false));
          notify.info(messages.filters.noResults);
          return;
        }
        if ((iec === "*" || !iec) && Array.isArray(iecs) && iecs.length > 0) {
          navigate(`/mask/vr/${vr}/${iecs[0]}/${maskingStatus}/${dicomType}`, {
            replace: true,
          });
        }
      })
      .catch((error) => {
        if (requestId !== listRequestRef.current) return; // superseded
        setIecList([]);
        dispatch(setLoading(false));
        notify.error(error, messages.filters.loadFailed);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vr, maskingStatus, dicomType, listKey, dispatch, iec, navigate]);

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
      navigate(`/mask/vr/${vr}/${nextIEC}/${maskingStatus}/${dicomType}`);
    } else {
      notify.info(messages.navigation.noNext("IEC"));
    }
  };

  const handlePrevious = () => {
    if (previousIEC) {
      navigate(`/mask/vr/${vr}/${previousIEC}/${maskingStatus}/${dicomType}`);
    } else {
      notify.info(messages.navigation.noPrevious("IEC"));
    }
  };

  const resolvedIec = iec && iec !== "*" ? iec : null;
  const noIecs = Array.isArray(iecList) && iecList.length === 0;

  return (
    <MaskVR
      vr={vr}
      iec={resolvedIec}
      noIecs={noIecs}
      maskingStatus={maskingStatus}
      dicomType={dicomType}
      dicomTypeOptions={dicomTypeOptions}
      onNext={handleNext}
      onPrevious={handlePrevious}
      hasNext={Boolean(nextIEC)}
      hasPrevious={Boolean(previousIEC)}
    />
  );
}
