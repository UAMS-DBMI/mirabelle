import React, { useEffect } from 'react';
import { useLoaderData } from 'react-router-dom';
import { useDispatch } from 'react-redux'
import { resetOptions } from '@/features/optionSlice';

import MaskReviewVR from '@/features/mask-review/MaskReviewVR';

import { getIECsForVRAwaitingReview } from '@/utilities';

import { setMaskerReviewConfig, reset } from '@/features/presentationSlice'

import './RouteMaskReviewVR.css';

export async function loader({ params }) {
  const iecs = await getIECsForVRAwaitingReview(params.visual_review_instance_id);

  return { vr: params.visual_review_instance_id, iecs };
}

export default function RouteMaskReviewVR() {
  const { vr, iecs } = useLoaderData();
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(resetOptions());
    dispatch(reset());
    dispatch(setMaskerReviewConfig());
  }, []);

  return (
    <MaskReviewVR vr={vr} iecs={iecs} />
  );
}
