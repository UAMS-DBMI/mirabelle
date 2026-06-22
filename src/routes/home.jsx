import React, { useLayoutEffect } from "react";
import { Link } from "react-router-dom";

import RouteLayout from "@/components/RouteLayout";
import { useDispatch } from "react-redux";
import { setTitle } from "@/features/optionSlice";

import "./home.css";

export default function Home() {
  const dispatch = useDispatch();

  useLayoutEffect(() => {
    dispatch(setTitle("Home")); // <-- set the title on mount
  }, [dispatch]);

  const content = (
    <div id="home">
      <p>This is a dev/testing page with links to a number of examples.</p>
      <h2>Examples of all routes</h2>
      <ul>
        <li>Masking</li>
        <li>
          <Link to="/mask/iec/1117950">Mask IEC (volume)</Link>
        </li>
        <li>
          <Link to="/mask/iec/1167702">Mask IEC (stack)</Link>
        </li>
        <li>
          <Link to="/mask/vr/1336">Mask VR</Link>
        </li>

        <li>Masking Review</li>
        <li>
          <Link to="/mask/review/iec/1117950">Mask Review IEC (volume)</Link>
        </li>
        <li>
          <Link to="/mask/review/iec/1167702">Mask Review IEC (stack)</Link>
        </li>
        <li>
          <Link to="/mask/review/vr/1336">Mask Review VR</Link>
        </li>

        <li>DICOM Visual Review</li>
        <li>
          <Link to="/review/dicom/iec/1117950">DICOM Review IEC (volume)</Link>
        </li>
        <li>
          <Link to="/review/dicom/iec/1167702">DICOM Review IEC (stack)</Link>
        </li>
        <li>
          <Link to="/review/dicom/iec/1220008">DICOM Review IEC (seg)</Link>
        </li>
        <li>
          <Link to="/review/dicom/vr/1515">DICOM Review VR</Link>
        </li>

        <li>Nifti Visual Review</li>
        <li>
          <Link to="/review/nifti/file/155149761">Nifti Review File</Link>
        </li>
        <li>
          <Link to="/review/nifti/vr/1">Nifti Review VR</Link>
        </li>
      </ul>
    </div>
  );

  return <RouteLayout middlePanel={content} />;
}
