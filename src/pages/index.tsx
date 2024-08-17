import Link from "next/link";

const Home = () => {
  return (
    <div className="container py-4">
      <h1 className="text-3xl font-bold mb-4">Dahua Compatible Firmware Site</h1>
      <p>This site can be used to find out which firmwares are *potentially* compatible with certain Dahua devices.</p>

      <h2 className="text-2xl font-bold my-4">How should I start?</h2>
      <ol className="list-inside list-decimal">
        <li>
          Start by asking your camera for its <code className="bg-red-300 p-1 rounded">updateSerial</code>. This can be
          gotten by visiting <code
          className="bg-red-300 p-1 rounded">http://&lt;IP_ADDRESS&gt;/cgi-bin/magicBox.cgi?action=getSystemInfoNew</code> or <code
          className="bg-red-300 p-1 rounded">http://&lt;IP_ADDRESS&gt;/cgi-bin/magicBox.cgi?action=getSystemInfo</code> in
          a web browser. In the page that loads after a login, note the value of <code
          className="bg-red-300 p-1 rounded">updateSerial</code>.
        </li>
        <li>
          Visit the <Link href="/compatibility" className="text-blue-600">Compatibility</Link> page, and use <code
          className="bg-red-300 p-1 rounded">CTRL + F</code> to find all firmwares I&apos;ve seen may be compatible.
        </li>
        <li>
          Download the firmware that you want for your device using the link provided.
        </li>
      </ol>

      <h2 className="text-2xl font-bold my-4">NOTES</h2>
      <ul className="list-inside list-disc">
        <li>
          All firmware updates you do to your device are at your own risk. Neither I, nor the vendor who provides the
          firmware assumes any responsibility for any negative effects of an update.
        </li>
        <li>
          If you&apos;ve found a problem on here, please keep in mind that these lists are automatically generated.
        </li>
        <li>
          I would really appreciate reaching out to me if you know how to programmatically determine which devices a
          firmware supports. I have figured out a couple different ways to try to find this information (using <code
          className="bg-red-300 p-1 rounded">binwalk</code> and such), but there are still many firmwares I have not
          figured out yet. Send me a message on <a href="https://ipcamtalk.com/members/deathcamel57.206868/"
          className="text-blue-600">my ipcamtalk</a> profile to get in touch.
        </li>
      </ul>
    </div>
  );
};

export default Home;
