import React, { useEffect } from 'react';
import { useLoaderData } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux'

import DicomReviewIEC from '@/features/dicom-review/DicomReviewIEC';

import { setVisualReviewConfig, reset } from '@/features/presentationSlice'
import { resetOptions } from '@/features/optionSlice';

import './RouteDicomReviewIEC.css';

export async function loader({ params }) {
  return { iec: params.iec };
}

export default function RouteDicomReviewIEC() {
  const dispatch = useDispatch();
  const viewState = useSelector(state => state.options.view);

  let { iec } = useLoaderData();

  useEffect(() => {
    console.log("[RouteDicomReviewIEC] useEffect running, iec=", iec);
    dispatch(resetOptions());
    dispatch(reset());
    dispatch(setVisualReviewConfig());
  }, []);

  return (
    <DicomReviewIEC iec={iec} />
  );
}
