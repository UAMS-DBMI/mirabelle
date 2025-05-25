import React, { useLayoutEffect } from 'react';
import { useLoaderData } from 'react-router-dom';
import { useDispatch } from 'react-redux'

import NiftiReviewVR from '@/features/nifti-review/NiftiReviewVR';

import { getFilesForNiftiVR } from '@/utilities';

import { setVisualReviewConfig, reset } from '@/features/presentationSlice'

import './RouteNiftiReviewVR.css';

export async function loader({ params }) {
  const files = await getFilesForNiftiVR(params.nifti_visual_review_instance_id);

  return { vr: params.nifti_visual_review_instance_id, files };
}

export default function RouteNiftiReviewVR() {
  const { vr, files } = useLoaderData();
  const dispatch = useDispatch();

  useLayoutEffect(() => {
    dispatch(reset());
    dispatch(setVisualReviewConfig());
  }, []);

  return (
    <NiftiReviewVR vr={vr} files={files} />
  );
}
