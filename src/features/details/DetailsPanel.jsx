import React, { useEffect, useState, useContext } from 'react';
import { useSelector } from 'react-redux';

import './DetailsPanel.css';

function downloadFile(details) {
  // Fetch the file from the path specified in details["path"]
  fetch(details["download_path"])
    .then((response) => response.blob()) // Convert the response to a blob
    .then((blob) => {
      const element = document.createElement("a");
      const url = URL.createObjectURL(blob);
      element.href = url;
      element.target = "_blank";
      element.download = details["download_name"];
      document.body.appendChild(element); // Required for this to work in FireFox
      element.click();
      document.body.removeChild(element); // Clean up after download
      URL.revokeObjectURL(url); // Free up memory
    })
    .catch((error) => console.error("Error downloading file:", error));
}

function download(details) {
  // Fetch the file from the path specified in details["path"]
  let download_path = details["download_path"];
  const link = document.createElement("a");
  link.href = download_path;
  //link.target = "_blank";
  /*  link.download = details["download_name"];*/
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}


export default function DetailsPanel({ details }) {
  const title = useSelector(state => state.options.title);

  const ignoredKeys = ["download_path", "download_name"];

  const handleDownload = 'File ID' in details ? downloadFile : download;

  return (
    <div id="details-panel" className="side-panel">
      <h2 id="title">Details</h2>
      <div className="wrapper">
        {Object.entries(details)
          .filter(([key]) => !ignoredKeys.includes(key))
          .map(([key, value]) => (
            <div key={key} className="detail-item">
              <p id="key">{key}:</p>
              <p id="value">{value}</p>
            </div>
          ))}
      </div>
      <button
        id="download"
        title="Download File"
        onClick={() => handleDownload(details)}
      >
        Download
      </button>
    </div>
  );
}