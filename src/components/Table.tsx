import Link from "next/link";
import React from "react";
import {FaBars, FaX} from "react-icons/fa6";
import { Disclosure, DisclosureButton, DisclosurePanel, Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'

interface Props {
  data: string[][],
}

const Table = (props: Props) => {
  const headers = props.data[0]

  const rows = props.data
  rows.shift()

  return (
    <>
      <table className="min-w-full divide-y shadow border-gray-200 rounded-lg">
        <thead className="bg-gray-50">
        <tr>
          {Object.entries(headers).map((data, index) => (
            <th key={"table-headers-" + index}>{data[1]}</th>
          ))}
        </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
        {Object.entries(rows).map(([rowKey, rowData], rowIndex) => (
          <tr key={rowKey}>
            {rowData.map((cellData, cellIndex) => (
              <td key={`${rowKey}-${cellIndex}`} dangerouslySetInnerHTML={{ __html: cellData }} />
            ))}
          </tr>
        ))}
        </tbody>
      </table>
    </>
  );
};

export default Table;
