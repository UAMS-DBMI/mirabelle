import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import toast from 'react-hot-toast';

import { getFilteredIECsForMaskReviewVR, getValuesForDicomVR } from "@/utilities";
import { resetOptions, setLoading } from "@/features/optionSlice";
import { setMaskerReviewConfig, reset } from "@/features/presentationSlice";
import MaskReviewVR from "@/features/mask-review/MaskReviewVR";

import "./RouteMaskReviewVR.css";

export default function RouteMaskReviewVR() {
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
    dispatch(setMaskerReviewConfig());
    dispatch(setLoading(true));
    setIecList(null);

    getFilteredIECsForMaskReviewVR(vr, maskingStatus, dicomType)
      .then((iecs) => {
        setIecList(iecs);
        if (Array.isArray(iecs) && iecs.length === 0) {
          dispatch(setLoading(false));
          toast.error('No IECs were found for the selected filters.');
          return;
        }
        if ((iec === '*' || !iec) && Array.isArray(iecs) && iecs.length > 0) {
          navigate(`/mask/review/vr/${vr}/${iecs[0]}/${maskingStatus}/${dicomType}`, { replace: true });
        }
      })
      .catch(() => {
        setIecList([]);
        dispatch(setLoading(false));
        toast.error('Failed to load IECs.');
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
      navigate(`/mask/review/vr/${vr}/${nextIEC}/${maskingStatus}/${dicomType}`);
    } else {
      toast.error("No next IEC available.");
    }
  };

  const handlePrevious = () => {
    if (previousIEC) {
      navigate(`/mask/review/vr/${vr}/${previousIEC}/${maskingStatus}/${dicomType}`);
    } else {
      toast.error("No previous IEC available.");
    }
  };

  const resolvedIec = iec && iec !== '*' ? iec : null;

  return (
    <MaskReviewVR
      vr={vr}
      iec={resolvedIec}
      maskingStatus={maskingStatus}
      dicomType={dicomType}
      dicomTypeOptions={dicomTypeOptions}
      onNext={handleNext}
      onPrevious={handlePrevious}
    />
  );
}
