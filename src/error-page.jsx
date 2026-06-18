import React from 'react'
import { useRouteError } from "react-router-dom";

import ErrorState from '@/components/ErrorState';
import './error-page.css';

export default function ErrorPage() {
  const error = useRouteError();
  console.error(error);

  const detail = error?.statusText || error?.message;

  return <ErrorState detail={detail} />;
}
