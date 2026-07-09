import React, { useEffect, useState, useContext } from "react";
import { useSelector } from "react-redux";

import { Link } from "react-router-dom";
import logoLight from "@/assets/mirabelle-logo-light.svg";
import logoDark from "@/assets/mirabelle-logo-dark.svg";
import { getUsername } from "@/utilities";
import MaterialIcon from "@/components/MaterialIcon";
import CacheStatus from "./CacheStatus";

import "./Header.css";

// Swap the "Volume"/"Stack" word in the title for the matching viewer-type
// glyph — the same icons the IEC queue uses. Titles without either word (Home,
// Nifti File Review) render unchanged.
function TitleContent({ title }) {
  const match = /\b(Volume|Stack)\b/.exec(title ?? "");
  if (!match) return title ?? null;
  const isVolume = match[1] === "Volume";
  return (
    <>
      {title.slice(0, match.index)}
      <MaterialIcon
        icon={isVolume ? "deployed_code" : "layers"}
        className="header-type-icon"
        title={isVolume ? "Volume (3D)" : "Stack (2D series)"}
      />
      {title.slice(match.index + match[0].length)}
    </>
  );
}

function Header() {
  const title = useSelector((state) => state.options.title);
  const titleDetail = useSelector((state) => state.options.titleDetail);
  const [username, setUsername] = useState("Username");

  useEffect(() => {
    (async () => {
      const un = await getUsername();
      setUsername(un);
    })();
  }, []);

  return (
    <div
      id="header"
      className=" h-12 flex items-center px-6 rounded-lg bg-blue-100 dark:bg-blue-900"
    >
      <div id="logo" className="h-10">
        <Link to="/">
          {/* Light theme logo */}
          <img
            src={logoLight}
            alt="Logo Light"
            className="w-full h-full object-contain dark:hidden"
          />
          {/* Dark theme logo */}
          <img
            src={logoDark}
            alt="Logo Dark"
            className="w-full h-full object-contain hidden dark:block"
          />
        </Link>
      </div>
      <div id="title" className="flex-1 flex items-center gap-2 ml-2 min-w-0">
        <span className="header-title">
          <TitleContent title={title} />
        </span>
        {titleDetail && (
          <span className="header-title-detail">{titleDetail}</span>
        )}
      </div>
      <CacheStatus />
      <div id="username" className="text-right">
        {username}
      </div>
    </div>
  );
}

export default Header;
