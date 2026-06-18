import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { notify } from "@/lib/notify";
import { messages } from "@/lib/messages";

import MaskVR from "@/features/mask/MaskVR";
import { resetOptions, setLoading } from "@/features/optionSlice";
import { setMaskerConfig, reset } from "@/features/presentationSlice";
import { getFilteredIECsForMaskVR, getValuesForDicomVR } from "@/utilities";

import "./RouteMaskVR.css";

export default function RouteMaskVR() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { vr, iec, maskingStatus: rawMaskingStatus, dicomType: rawDicomType } = useParams();
  const maskingStatus = rawMaskingStatus || 'All';
  const dicomType = rawDicomType || 'All';

  const [iecList, setIecList] = useState(null);
  const [dicomTypeOptions, setDicomTypeOptions] = useState(['All']);

  // Prefetch image-type options once per VR so the dropdown is populated
  // immediately and survives IEC navigation (avoids the per-mount fetch flicker).
  useEffect(() => {
    let mounted = true;
    getValuesForDicomVR(vr)
      .then((values) => {
        if (!mounted) return;
        const list = Array.from(new Set((values?.dicom_file_types || []).map((it) => it?.dicom_file_type).filter(Boolean)));
        setDicomTypeOptions(['All', ...list]);
      })
      .catch(() => setDicomTypeOptions(['All']));
    return () => { mounted = false; };
  }, [vr]);

  useEffect(() => {
    dispatch(resetOptions());
    dispatch(reset());
    dispatch(setMaskerConfig());
    dispatch(setLoading(true));
    setIecList(null);

    getFilteredIECsForMaskVR(vr, maskingStatus, dicomType)
      .then((iecs) => {
        setIecList(iecs);
        if (Array.isArray(iecs) && iecs.length === 0) {
          dispatch(setLoading(false));
          notify.error(messages.filters.noResults);
          return;
        }
        if ((iec === '*' || !iec) && Array.isArray(iecs) && iecs.length > 0) {
          navigate(`/mask/vr/${vr}/${iecs[0]}/${maskingStatus}/${dicomType}`, { replace: true });
        }
      })
      .catch((error) => {
        setIecList([]);
        dispatch(setLoading(false));
        notify.error(error, messages.filters.loadFailed);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vr, maskingStatus, dicomType, dispatch, iec, navigate]);

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
      notify.error(messages.navigation.noNext("IEC"));
    }
  };

  const handlePrevious = () => {
    if (previousIEC) {
      navigate(`/mask/vr/${vr}/${previousIEC}/${maskingStatus}/${dicomType}`);
    } else {
      notify.error(messages.navigation.noPrevious("IEC"));
    }
  };

  const resolvedIec = iec && iec !== '*' ? iec : null;
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
    />
  );
}
