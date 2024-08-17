import {getCameras, getFirmwares} from '@/lib/data';
import Link from "next/link";

type Props = {
  firmwareId: string;
  firmwareCompatible: string[];
  fileURL: string | null;
};

// TODO: Handle nonexistent pages

const FirmwarePage = ({firmwareId, firmwareCompatible, fileURL}: Props) => {
  if (!firmwareId) {
    return (
      <div className="container mx-auto p-4">
        <p>Firmware not found</p>
      </div>
    );
  }

  return (
    <div className="container py-4">
      <h1 className="text-3xl font-bold mb-4">{firmwareId}</h1>

      <h3 className="font-bold mt-4 mb-1">Download URL</h3>
      <p>{
        fileURL
          ? <Link href={fileURL} className="text-blue-600">{fileURL}</Link>
          : <p>Missing</p>
      }</p>

      <h3 className="font-bold mt-4 mb-1">Compatible Cameras</h3>
      {firmwareCompatible.map(value => (
        <p key={value}>
          <Link href={"/camera/" + value} className="text-blue-600">{value}</Link>
        </p>
      ))}
    </div>
  );
};

export const getStaticPaths = async () => {
  const firmwares = getFirmwares();
  const paths = Object.keys(firmwares).map(firmwareId => ({
    params: {firmwareId},
  }));

  return {paths, fallback: 'blocking'};
};

export const getStaticProps = async (context: { params: { firmwareId: string; }; }) => {
  const firmwareId = context.params?.firmwareId as string;
  const firmwares = await getFirmwares();

  const firmwareCompatible = firmwares[firmwareId].compatible;

  const cameras = await getCameras()
  let fileURL: string | null = null
  for (const cameraKey in cameras) {
    if (cameras[cameraKey].url.includes(firmwareId)) {
      fileURL = cameras[cameraKey].url
    }
  }

  return {
    props: {
      firmwareId,
      firmwareCompatible,
      fileURL,
    },
  };
};

export default FirmwarePage;
