import {getFirmwares} from '@/lib/data';
import Table from "@/components/Table";
import {useEffect, useState} from "react";
import {Firmware} from "@/lib/Firmware";

const Compatibility = () => {
  const [firmwares, setFirmwares] = useState<Record<string, Firmware>>({});

  useEffect(() => {
    const fetchData = async () => {
      const fetchedFirmwares = await getFirmwares();
      setFirmwares(fetchedFirmwares);
    };

    fetchData();
  }, []);

  // TODO: Add searching values

  let data = [["Firmware", "Compatible Devices"]]
  for (let key in firmwares) {
    let devices_string = ''
    const link = "<a href=\"/firmware/" + encodeURIComponent(key) + "\" class=\"text-blue-600\">"+ key + "</a>"

    for (const device of firmwares[key].compatible) {
      devices_string += "<p><a href=\"/camera/" + encodeURIComponent(encodeURIComponent(device)) + "\" class=\"text-blue-600\"><code>" + device + "</code></a></p>"
    }

    let row = [link, devices_string]
    data.push(row)
  }

  return (
    <div className="container py-4">
      <h1 className="text-3xl font-bold mb-4">Firmware Compatibility</h1>

      <Table data={data}/>
    </div>
  );
};

export default Compatibility;
