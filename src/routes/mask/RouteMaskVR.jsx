import React, { useEffect } from 'react';
import { useLoaderData } from 'react-router-dom';
import { useDispatch } from 'react-redux'
import { resetOptions } from '@/features/optionSlice';

import MaskVR from '@/features/mask/MaskVR';

import { getIECsForVR } from '@/utilities';

import { setMaskerConfig, reset } from '@/features/presentationSlice'

import './RouteMaskVR.css';

export async function loader({ params }) {
  const iecs = await getIECsForVR(params.visual_review_instance_id);

  return { vr: params.visual_review_instance_id, iecs };
}

export default function RouteMaskVR() {
  const { vr, iecs } = useLoaderData();
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(resetOptions());
    dispatch(reset());
    dispatch(setMaskerConfig());
  }, []);

  return (
    <MaskVR vr={vr} iecs={iecs} />
  );
}
