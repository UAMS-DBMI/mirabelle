import { useEffect } from "react";
import { useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";

import { DECIMATE_URL_PARAM } from "@/features/optionSlice";

/**
 * Keeps `?decimate=N` in the URL in step with the decimate option, so a reload
 * or a copied link opens at the same frame count.
 *
 * The URL only mirrors Redux. Its starting value is read once when the store
 * is created (optionSlice); after that this writes Redux back out, both when
 * the curator applies a value in the tools panel and after every navigation,
 * because the VR queue builds its next/previous paths without a query string.
 * 0 means "no decimation" and drops the param. `replace`, so the mirror never
 * adds a history entry of its own.
 */
export default function useDecimateInUrl() {
  const decimate = useSelector((state) => state.options.decimate);
  const [searchParams, setSearchParams] = useSearchParams();
  const inUrl = searchParams.get(DECIMATE_URL_PARAM);

  useEffect(() => {
    const wanted = decimate > 0 ? String(decimate) : null;
    if (inUrl === wanted) return;
    setSearchParams(
      (params) => {
        if (wanted === null) params.delete(DECIMATE_URL_PARAM);
        else params.set(DECIMATE_URL_PARAM, wanted);
        return params;
      },
      { replace: true },
    );
  }, [decimate, inUrl, setSearchParams]);
}
