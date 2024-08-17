import {getCameras, getFirmwares} from '@/lib/data';
import Link from "next/link";
import firmwareId from "@/pages/firmware/[firmwareId]";

type Props = {
  cameraId: string;
  firmwaresCompatible: string[];
};

// TODO: Handle nonexistent pages

const CameraPage = ({ cameraId, firmwaresCompatible }: Props) => {
  if (!cameraId) {
    return (
      <div className="container mx-auto p-4">
        <p>Camera not found</p>
      </div>
      );
  }

  return (
    <div className="container py-4">
      <h1 className="text-3xl font-bold mb-4">{cameraId}</h1>

      <h3 className="font-bold mt-4 mb-1">Compatible Firmwares</h3>
      {firmwaresCompatible.map(value => (
        <p key={value}>
          <Link href={"/firmware/" + value} className="text-blue-600">{value}</Link>
        </p>
      ))}
    </div>
  );
};

export const getStaticPaths = async () => {
  const firmwares = getFirmwares();

  let allcameras = []
  for (const firmware in firmwares) {
    for (let index in firmwares[firmware].compatible) {
      if (!(firmwares[firmware].compatible[index] in allcameras)) {
        allcameras.push(firmwares[firmware].compatible[index])
      }
    }
  }

  const paths = Object.keys(allcameras).map((value, index) => ({
    params: { cameraId: allcameras[index] },
  }));

  return { paths, fallback: 'blocking' };
};

export const getStaticProps = async (context: { params: { cameraId: string; }; }) => {
  const cameraId = context.params?.cameraId as string;
  const firmwares = getFirmwares();

  let firmwaresCompatible: string[] = [];
  for (const firmware in firmwares) {
    if (firmwares[firmware].compatible.includes(cameraId)) {
      firmwaresCompatible.push(firmware)
    }
  }

  return {
    props: {
      cameraId,
      firmwaresCompatible,
    },
  };
};

export default CameraPage;
