import React, { useEffect, useState, useContext } from "react";
import { useSelector } from "react-redux";

import { Link } from "react-router-dom";
import logoLight from "@/assets/mirabelle-logo-light.svg";
import logoDark from "@/assets/mirabelle-logo-dark.svg";
import { getUsername } from "@/utilities";
import CacheStatus from "./CacheStatus";

import "./Header.css";

function Header() {
  const title = useSelector((state) => state.options.title);
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
      <div id="title" className="flex-1 text-left ml-2">
        {title}
      </div>
      <CacheStatus />
      <div id="username" className="text-right">
        {username}
      </div>
    </div>
  );
}

export default Header;
