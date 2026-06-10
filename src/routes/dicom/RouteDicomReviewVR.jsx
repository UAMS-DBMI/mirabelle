import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch } from 'react-redux'
import toast from 'react-hot-toast';

import { getIECsForDicomVR, getFilteredIECsForDicomVR, getValuesForDicomVR } from '@/utilities';
import { resetOptions, setLoading } from "@/features/optionSlice";
import { setVisualReviewConfig, reset } from "@/features/presentationSlice";
import DicomReviewVR from '@/features/dicom-review/DicomReviewVR';

import './RouteDicomReviewVR.css';

export default function RouteDicomReviewVR() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { vr, iec, reviewStatus: rawReviewStatus, dicomType: rawDicomType } = useParams();
  const reviewStatus = rawReviewStatus || 'All';
  const dicomType = rawDicomType || 'All';
  const [iecList, setIecList] = useState(null);
  const [dicomTypeOptions, setDicomTypeOptions] = useState([]);

  // Prefetch filter lists so UI can populate immediately
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
    dispatch(setVisualReviewConfig());
    dispatch(setLoading(true));
    // Clear stale list to avoid redirecting with previous results
    setIecList(null);

    getFilteredIECsForDicomVR(
      vr,
      reviewStatus,
      dicomType
    )
      .then((iecs) => {
        setIecList(iecs);
        if (Array.isArray(iecs) && iecs.length === 0) {
          // No results: stop loading and notify
          dispatch(setLoading(false));
          toast.error('No IECs were found for the selected filters.');
          return;
        }
        // If IEC is '*' or missing, redirect to the FIRST IEC from these fresh results
        if ((iec === '*' || !iec) && Array.isArray(iecs) && iecs.length > 0) {
          const firstIec = (() => {
            const item = iecs[0];
            if (!item) return null;
            if (typeof item === 'string' || typeof item === 'number') return String(item);
            return String(item.image_equivalence_class_id ?? item.IEC ?? item.id ?? item.value);
          })();

          if (firstIec) {
            navigate(
              ['/review', 'dicom', 'vr', vr, firstIec, reviewStatus, dicomType].join('/'),
              { replace: true }
            );
          }
        }
      })
      .catch(() => {
        setIecList([]);
        dispatch(setLoading(false));
        toast.error('Failed to load IECs.');
      });
  }, [vr, reviewStatus, dicomType, dispatch, iec, navigate]);  
  
  // calculate the next and previous IECs (supports numbers or objects)
  const idOf = (item) => {
    if (item == null) return null;
    if (typeof item === 'string' || typeof item === 'number') return String(item);
    return String(item.image_equivalence_class_id ?? item.IEC ?? item.id ?? item.value);
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
      navigate(`/review/dicom/vr/${vr}/${nextIECId}/${reviewStatus}/${dicomType}`);
    } else {
      toast.error("No next IEC available.");
    }
  };

  const handlePrevious = () => {
    if (previousIECId) {
      navigate(`/review/dicom/vr/${vr}/${previousIECId}/${reviewStatus}/${dicomType}`);
    } else {
      toast.error("No previous IEC available.");
    }
  };

  // Always render the page; when IEC isn't resolved yet or list is empty, pass iec=null
  const resolvedIec = iec && iec !== '*' ? iec : null;
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