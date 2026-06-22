/**
 * The plan here is:
 *   This component is routed to from two routes:
 *   * /test/:vr/:file_id
 *   * /test/:vr
 *
 *   If the user enters with the vr-only route, we fetch the file list
 *   for that VR and then navigate to the first file (first route, including
 *   file_id).
 */
import React, { useEffect, useLayoutEffect, useState } from "react";
import { Routes, Route, useParams, Link, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { setOption } from "@/features/optionSlice";
import { getFiles } from "@/utilities";

import "./RouteTests.css";

export default function RouteTests({}) {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { file_id, vr } = useParams();
  const fileList = useSelector((state) => state.options.fileList);

  const [a, setA] = useState(0);

  let offset = null;
  let nextIEC = null;
  let previousIEC = null;

  useEffect(() => {
    /**
     * This is very delicate and carefully ordered.
     * If the user enters with no fileList, we fetch the files
     * regardless of whether file_id is provided or not.
     *
     * This will force an update and then this will run again,
     * this time if file_id is not provided, we navigate to the first file,
     * which we now know.
     *
     * These must be in the same function, otherwise they will both run
     * at the same time and break.
     */
    console.log("[TestTwo] useEffect running, vr=", vr, "file_id=", file_id);
    if (!fileList) {
      console.log("[TestTwo] No fileList found, fetching files for VR:", vr);
      getFiles(vr).then((files) => {
        // This should force an update after this function
        dispatch(setOption({ key: "fileList", value: files }));
      });
    } else {
      if (file_id === undefined) {
        console.log("No file_id provided, navigating to first file.", fileList);
        navigate(`/test/${vr}/${fileList[0]}`);
      }
    }
  }, [vr, fileList, file_id]);

  if (fileList) {
    const file_id_number = parseInt(file_id);
    offset = fileList.indexOf(file_id_number);
    const nextOffset = offset + 1;
    const previousOffset = offset - 1;
    if (nextOffset < fileList.length) nextIEC = fileList[nextOffset];
    // If it's too big, nextIEC is left null
    if (previousOffset >= 0) previousIEC = fileList[previousOffset];
  }

  return (
    <div id="testtwo-component">
      <h1>Route Tests</h1>
      <p>VR: {vr}</p>
      <p>Total files in VR: {fileList ? fileList.length : "Loading..."}</p>
      <p>File ID: {file_id}</p>

      <p>Offset: {offset}</p>
      {nextIEC && (
        <p>
          <Link to={`/test/${vr}/${nextIEC}`} className="button">
            Next IEC
          </Link>
        </p>
      )}
      {previousIEC && (
        <p>
          <Link to={`/test/${vr}/${previousIEC}`} className="button">
            Previous IEC
          </Link>
        </p>
      )}
      <p>
        <Link to={`/test/${vr}`} className="button">
          Go back to the VR page
        </Link>
      </p>

      <p>Current value of A: {a}</p>
      <a
        href="#"
        className="button"
        onClick={() => {
          console.log(a);
          setA(a + 1);
        }}
      >
        Inc A
      </a>
      {fileList && fileList.length > 0 ? (
        <ul>
          {fileList.map((file, index) => (
            <li key={index}>
              {file}
              <br />
              {index === offset && <span>(current)</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p>No files available for this VR.</p>
      )}
    </div>
  );
}
